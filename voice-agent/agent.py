import os
from dotenv import load_dotenv

from livekit import agents
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


# ---------- TOOL STUBS ----------

@function_tool()
async def extract_location(context: RunContext, transcript: str) -> dict:
    """
    Dummy tool: Extract the address or house location from user speech.
    Returns { "address": string }
    """
    print(f"[TOOL] extract_location called with: {transcript}")
    # Stubbed response
    return {"address": "42 Pumpkin Street, Brisbane"}


@function_tool()
async def extract_candies(context: RunContext, transcript: str) -> dict:
    """
    Dummy tool: Extract candy names mentioned in the user's transcript.
    Returns { "candies": [string] }
    """
    print(f"[TOOL] extract_candies called with: {transcript}")
    # Stubbed response
    return {"candies": ["KitKat", "M&M's"]}


@function_tool()
async def submit_report(context: RunContext, address: str, candies: list[str]) -> dict:
    """
    Dummy tool: Pretend to send a candy report to backend.
    Returns confirmation of submission.
    """
    print(f"[TOOL] submit_report called with: {address=} {candies=}")
    # Stubbed confirmation
    return {"status": "ok", "message": f"Report submitted for {address} with {candies}"}


# ---------- AGENT CLASS ----------

class CandyAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions=(
                "You are Candy Rush, a Halloween candy reporting voice assistant. "
                "Your goal is to record which houses have which candies. "
                "Ask the caller for the house address or location, then ask what candy they saw there. "
                "Extract two things: address and candy names. "
                "Use the available tools to extract this information and submit the report. "
                "Once submitted, confirm to the user by saying: "
                "'Got it! I've recorded that at [address] there are [candies]. Happy Halloween!' "
                "Keep your responses short, friendly, and conversational. "
                "Avoid complex punctuation, emojis, or formatting."
            ),
            tools=[extract_location, extract_candies, submit_report],
        )

    async def on_enter(self):
        """Called automatically when the agent session starts."""
        await self.session.generate_reply(
            instructions=(
                "Hi there! Welcome to Candy Rush. "
                "Please tell me the house address and what candies you saw there."
            )
        )


# ---------- ENTRYPOINT ----------

async def entrypoint(ctx: JobContext):
    await ctx.connect()

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

    agent = CandyAgent()

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
