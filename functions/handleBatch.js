// Debug fonksiyonu - Firebase Functions'ın çalışıp çalışmadığını test et
exports.debugTest = functions.https.onRequest((req, res) => {
  console.log("✅ Firebase Functions çalışıyor!");
  console.log("🔥 Functions object keys:", Object.keys(functions));
  console.log("📡 Pubsub available?", !!functions.pubsub);
  console.log("🌐 HTTPS available?", !!functions.https);
  
  res.status(200).json({
    message: "Firebase Functions çalışıyor!",
    functionsKeys: Object.keys(functions),
    pubsubAvailable: !!functions.pubsub,
    httpsAvailable: !!functions.https
  });
});