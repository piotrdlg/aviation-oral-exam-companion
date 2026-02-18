import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 36,
          background:
            "linear-gradient(135deg, #161b22 0%, #0d1117 50%, #161b22 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "3px solid #2a3040",
          position: "relative",
        }}
      >
        {/* Amber H built from divs — instrument marking style */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 110,
            height: 116,
            filter: "drop-shadow(0 0 18px rgba(245, 166, 35, 0.35))",
          }}
        >
          {/* Left vertical bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 32,
              height: 116,
              background: "#f5a623",
              borderRadius: 4,
            }}
          />
          {/* Right vertical bar */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: 32,
              height: 116,
              background: "#f5a623",
              borderRadius: 4,
            }}
          />
          {/* Crossbar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 42,
              width: 110,
              height: 32,
              background: "#f5a623",
              borderRadius: 4,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
