// One-off generator: node scripts/generate-wake-qr.js
// Produces assets/wake-qr.png. Print it and stick it somewhere that forces
// you out of bed. Re-run after changing WAKE_TOKEN in src/wakeAlarmConfig.js.
const path = require("path");
const QRCode = require("qrcode");
const { WAKE_QR_VALUE } = require("../src/wakeAlarmConfig");

async function main() {
  const outPath = path.resolve(__dirname, "../assets/wake-qr.png");
  await QRCode.toFile(outPath, WAKE_QR_VALUE, {
    type: "png",
    width: 900,
    margin: 3,
    color: { dark: "#14110b", light: "#ffffff" },
  });
  console.log(`Wake QR written to ${outPath}`);
  console.log(`Encoded value: ${WAKE_QR_VALUE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
