const NodeMediaServer = require("node-media-server");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8001, // Cambiato da 8000 a 8001
    allow_origin: "*",
  },
};

const nms = new NodeMediaServer(config);

nms.on("preConnect", (id, args) => {
  console.log(
    "[NodeEvent on preConnect]:",
    `id=${id} args=${JSON.stringify(args)}`
  );
});

// Genera i segmenti HLS utilizzando fluent-ffmpeg
nms.on("postPublish", (id, StreamPath, args) => {
  const streamKey = path.basename(StreamPath);
  if (!fs.existsSync(path.join(__dirname, "media", streamKey))) {
    fs.mkdirSync(path.join(__dirname, "media", streamKey));
  }
  const outputPath = path.join(__dirname, "media", streamKey, "index.m3u8");

  // Aggiungi -hls_flags append_list per aggiungere nuovi segmenti all'M3U8 esistente
  const ffmpegCommand = `ffmpeg -i rtmp://localhost:1935${StreamPath} -c:v libx264 -c:a aac -f hls -hls_time 1 -hls_list_size 3 -hls_flags discont_start ${outputPath}`;

  exec(ffmpegCommand, (err, stdout, stderr) => {
    if (err) {
      console.error("Errore durante la generazione di HLS:", err);
    } else {
      console.log("Generazione di HLS completata:", outputPath);
    }
  });
});

// ... Altri eventi come nell'esempio precedente ...

nms.on("donePublish", (id, StreamPath, args) => {
  const streamKey = path.basename(StreamPath);
  const outputPath = path.join(__dirname, "media", streamKey);

  // Cancella la directory associata allo stream
  fs.rmdirSync(outputPath, { recursive: true }, (err) => {
    if (err) {
      console.error("Errore durante la cancellazione della directory:", err);
    } else {
      console.log("Directory cancellata:", outputPath);
    }
  });
});

nms.run();

// Aggiungi il supporto a HLS gestendo le richieste HTTP per i file .m3u8 e i segmenti video
http
  .createServer((req, res) => {
    const filePath = req.url.replace(/^\/stream\//, ""); // Rimuovi il prefisso "/stream/" dal percorso

    // Imposta l'header "Access-Control-Allow-Origin" per consentire le richieste da qualsiasi origine
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Imposta la cache HTTP per la playlist HLS
    res.setHeader("Cache-Control", "max-age=5");

    // Verifica se la richiesta è per un file .m3u8 o un segmento video
    if (filePath.endsWith(".m3u8") || filePath.endsWith(".ts")) {
      // Costruisci il percorso completo del file richiesto
      const fullPath = path.join(__dirname, "media", filePath);

      // Verifica se il file richiesto esiste sul filesystem
      if (fs.existsSync(fullPath)) {
        // Leggi il file richiesto dal filesystem e restituisci il contenuto con l'header "Content-Type" appropriato
        const contentType = filePath.endsWith(".m3u8")
          ? "application/x-mpegURL"
          : "video/MP2T";

        res.writeHead(200, { "Content-Type": contentType });
        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
      } else {
        // Se il file non esiste, restituisci una risposta di errore 404
        res.writeHead(404);
        res.end("File not found");
      }
    } else {
      // Se la richiesta non è per un file .m3u8 o un segmento video, restituisci una risposta di errore 404
      res.writeHead(404);
      res.end("File not found");
    }
  })
  .listen(8000, () => {
    console.log(
      "Server HTTP in ascolto sulla porta 8000 per HTTP Live Streaming (HLS)"
    );
  });
