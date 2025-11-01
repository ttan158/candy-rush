export type LngLat = [number, number];

export type CandyLocation = {
  id: string;
  title: string;
  address: string;
  coord: LngLat; // [lng, lat]
  candyType: string; // used to pick icon from /public/<candyType>.png, falls back to /candy.png
};

// Demo data near central Auckland. Replace/edit as you like.
export const CANDY_LOCATIONS: CandyLocation[] = [
  {
    id: "sky-tower",
    title: "KitKat @ Sky Tower",
    address: "Sky Tower, Auckland 1010",
    coord: [174.763332, -36.84846],
    candyType: "kitkat",
  },
  {
    id: "art-gallery",
    title: "KitKat @ Art Gallery",
    address: "Auckland Art Gallery Toi o Tāmaki",
    coord: [174.766, -36.852],
    candyType: "kitkat",
  },
  {
    id: "britomart",
    title: "KitKat @ Britomart",
    address: "Britomart, Auckland 1010",
    coord: [174.7701, -36.8442],
    candyType: "kitkat",
  },
  {
    id: "britomart",
    title: "KitKat @ Britomart",
    address: "Britomart, Auckland 1010",
    coord: [174.7701, -36.8442],
    candyType: "candy",
  },
];
