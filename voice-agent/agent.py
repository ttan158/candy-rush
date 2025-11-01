import os
import json
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import httpx

from livekit import agents, api
from livekit.agents import (
    Agent,
    AgentSession,
    RoomInputOptions,
    RunContext,
    JobContext,
    function_tool,
)
from livekit.plugins import (
    deepgram,
    elevenlabs,
    noise_cancellation,
    silero,
    openai,
)
from livekit.plugins.turn_detector.multilingual import MultilingualModel


load_dotenv(".env.local")


# ---------- CONFIG ----------

WEB_BASE_URL = os.getenv("WEB_BASE_URL", "http://localhost:3000").rstrip("/")

RECORDING_PREFIX = "recordings/"


# ---------- TOOLS (call web API) ----------

@function_tool()
async def get_candies(context: RunContext) -> dict:
    """Fetch list of valid candy names from the web API."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{WEB_BASE_URL}/api/candies")
        resp.raise_for_status()
        names = resp.json()
    return {"candies": names}


@function_tool()
async def search_address(context: RunContext, query: str) -> dict:
    """Search for an address using the web API (Mapbox powered)."""
    params = {"q": query, "limit": 1}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{WEB_BASE_URL}/api/address/search", params=params)
        if resp.status_code == 404:
            return {"matches": []}
        resp.raise_for_status()
        data = resp.json()
    return data  # { matches: [ { address, latitude, longitude } ] }


@function_tool()
async def submit_report(
    context: RunContext,
    address: str,
    latitude: float,
    longitude: float,
    candies: list[str],
) -> dict:
    """Submit the final report to the web API."""
    payload = {
        "callerNumber": os.getenv("CALLER_NUMBER", "unknown"),
        "transcript": "Reported via Candy Rush voice agent",
        "recordingUrl": os.getenv("RECORDING_URL", "N/A"),
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "candies": candies,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{WEB_BASE_URL}/api/reports", json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data


# ---------- AGENT CLASS ----------

class CandyAgent(Agent):
    def __init__(self, instructions: str):
        super().__init__(
            instructions=instructions,
            tools=[get_candies, search_address, submit_report],
        )

    async def on_enter(self):
        """Called automatically when the agent session starts."""
        await self.session.generate_reply(
            instructions=(
                "Hi there! Welcome to Candy Rush. "
                "First, what's the house address? After we confirm, I'll ask the candies."
            )
        )


# ---------- ENTRYPOINT ----------

async def entrypoint(ctx: JobContext):
    await ctx.connect()

    # ----- Optional call recording to S3-compatible storage -----
    try:
        dial_info = json.loads(ctx.job.metadata) if ctx.job.metadata else {}
    except Exception:
        dial_info = {}

    phone_number = dial_info.get("phone_number")
    is_real_phone_call = phone_number is not None

    if is_real_phone_call:
        try:
            current_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            recording_filename = f"{RECORDING_PREFIX}{ctx.room.name}_{current_ts}.ogg"

            req = api.RoomCompositeEgressRequest(
                room_name=ctx.room.name,
                audio_only=True,
                file_outputs=[
                    api.EncodedFileOutput(
                        file_type=api.EncodedFileType.OGG,
                        filepath=recording_filename,
                        s3=api.S3Upload(
                            bucket="calls",
                            endpoint="https://wzibktovmkgghxuoqvqx.storage.supabase.co/storage/v1/s3",
                            region="ap-southeast-2",
                            access_key="f0071448a2eb73afeaf672996b279c9f",
                            secret="506313ecd0acfb94d2de421d42a010a7f63ab2b59485d66fa159e05528e6f209",
                            force_path_style=True,
                        ),
                    )
                ],
            )

            lkapi = api.LiveKitAPI()
            await lkapi.egress.start_room_composite_egress(req)
            await lkapi.aclose()
        except Exception as e:
            pass

    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="en-NZ"),
        llm=openai.LLM(model="gpt-4.1-mini"),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            model="eleven_flash_v2_5",
            # voice_id="CV4xD6M8z1X1kya4Pepj",  # Neutral
            # voice_id="8G0ZG2JW5LHLYBVnqaKa",  # Kiwi
            voice_id="Fahco4VZzobUeiPqni1S",  # British
            # voice_id = "wXvR48IpOq9HACltTmt7" # Spooky
            # voice_id = "1BfrkuYXmEwp8AWqSLWk" # Declan
        ),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    # Save transcript on shutdown for auditing/debugging
    async def save_transcript():
        try:
            if session and hasattr(session, "history"):
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                transcript_path = f"/tmp/transcript_{ctx.room.name}_{ts}.json"
                history_dict = session.history.to_dict()
                with open(transcript_path, "w") as f:
                    json.dump(history_dict, f, indent=2)
        except Exception as e:
            pass

    ctx.add_shutdown_callback(save_transcript)

    # Fetch candy list to inject into system prompt for robust matching
    candies_list: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{WEB_BASE_URL}/api/candies")
            if resp.status_code == 200:
                candies_list = resp.json() or []
    except Exception:
        candies_list = []

    candies_inline = ", ".join(candies_list) if candies_list else "(none available)"

    # instructions = (
    #     "You are Candy Rush, an inbound voice agent for Halloween candy reporting. "
    #     "User inputs come from a speech-to-text service and may be slightly inaccurate. "
    #     "Your responses will be passed to a text-to-speech service. "
    #     "Keep responses short, friendly, and conversational. Avoid emojis. "
    #     "Follow this exact flow: "
    #     "1) Ask for the house address where the candy is."
    #     "2) Normalise spelled-out house numbers to numerals before searching (e.g., 'ten queen street' → '10 Queen Street'). Call the search_address tool with the Noramlised phrase. If it returns no matches, politely ask the user to re-check and try again. "
    #     "3) If the search returns a single clear match, proceed without confirmation. If multiple matches are returned (ambiguous), read back the top match briefly and ask the user to confirm yes/no; if no, ask for corrections and search again. "
    #     "4) Once the address is confirmed, ask which candies they saw. "
    #     f"Valid candies from the database (case-insensitive): {candies_inline}. "
    #     "Map the user's candy words to this list; ignore anything not listed. "
    #     "5) When you have the final address (address, latitude, longitude) and at least one valid candy, call submit_report. Noramlise any spelled-out house numbers to numerals in the address you submit. "
    #     "Acknowledge success briefly after submission."
    # )

    instructions = (
    "You are Candy Rush, a cheerful Halloween helper collecting reports of candy sightings. "
    "User inputs come from a speech-to-text service and may be slightly inaccurate. "
    "Your responses will be passed to a text-to-speech service. "
    "Keep responses short, friendly, and spooky-fun. Avoid emojis. "
    "Follow these exact spoken lines in order: "
    "Step 1: Say 'Happy Halloween! What’s the house address where you spotted the candy cauldron?' "
    "When the user replies, normalise any spelled-out numbers to digits "
    "(for example, 'ten queen street' becomes '10 Queen Street') and call the search_address tool. "
    "If no matches are found, say 'Hmm, that one’s vanished into the mist. Could you double-check the address for me?' "
    "If multiple matches are found, read back the top one and say 'I found one at [top match]. Is that the spooky spot you meant?' "
    "If the user says no, ask 'No worries, mortal! What’s the right address?' and search again. "
    "If one clear match is found, continue automatically. "
    "Step 2: Once the address is confirmed, say 'Great! What candies were haunting that house?' "
    f"Only recognise these candies: {candies_inline}. Ignore anything else. "
    "Step 3: When you’ve got at least one valid candy and a confirmed address (with latitude and longitude), "
    "call submit_report with the normalised address. "
    "After submission, say 'Wicked! Your candy report has been summoned. Thanks for helping us map the treats!'"
)


    agent = CandyAgent(instructions=instructions)

    await session.start(
        room=ctx.room,
        agent=agent,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
        ),
    )


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="candy-rush",
        )
    )
