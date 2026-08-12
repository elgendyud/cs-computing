import "./globals.css";

export const metadata = {
  title: "Device Readout",
  description: "Live hardware & software readout of your device, plus a WebGPU puzzle.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
