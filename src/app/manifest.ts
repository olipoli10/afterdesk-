import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENDVERA TextAssist",
    short_name: "Endvera",
    description:
      "AI operating assistant for small construction contractors, with job context, calendar, follow-ups, prepared communications and human backup.",
    start_url: "/textassist",
    scope: "/",
    display: "standalone",
    background_color: "#0A0B0D",
    theme_color: "#0A0B0D",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
