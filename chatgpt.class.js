const { CoreClass } = require("@bot-whatsapp/bot");
const { downloadMediaMessage } = require('@adiwajshing/baileys');
const fs = require('fs');
const ytdl = require('ytdl-core');
const path = require('path');
const pdf = require('pdf-parse');
const { convertOggMp3 } = require('./services/convert');
const { voiceToText } = require('./services/whisper');
const { createWorker } = require('tesseract.js');
const { Sticker, createSticker, StickerTypes } = require('wa-sticker-formatter');


class ChatGPTClass extends CoreClass {
  queue = [];
  optionsGPT = { model: "text-davinci-003" };
  openai = undefined;

  constructor(_database, _provider) {
    super(null, _database, _provider);
    this.init().then();
    this.provider = _provider; // Define provider en el constructor
  }

  init = async () => {
    const fetch = await import("node-fetch");
    const { ChatGPTAPI } = await import("chatgpt");

    this.openai = new ChatGPTAPI({
      apiKey: process.env.OPENAI_API_KEY,
      debug: true,
      fetch: fetch.default,
    });
  }

  

  // Función para realizar OCR en una imagen y luego enviar el texto a GPT-3.5 Turbo
  ocrAndSendToGPT = async (ctx, groupId) => {
    try {
      const buffer = await downloadMediaMessage(ctx, "buffer");
      const pathTmpImage = `${process.cwd()}/tmp/image-${Date.now()}.png`;
      await fs.promises.writeFile(pathTmpImage, buffer, null);
  
      // Realizar OCR en la imagen usando tesseract.js
      const { createWorker } = require('tesseract.js');
      const worker = await createWorker();
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data: { text } } = await worker.recognize(pathTmpImage);
      await worker.terminate();
  
      // Enviar el texto a la API de GPT-3.5 Turbo y manejar la respuesta
      const response = await this.openai.sendMessage(text, {
        conversationId: groupId ? groupId : undefined,
      });
  
      // Puedes enviar la respuesta al remitente original
      this.sendFlowSimple([{
        ...response,
        answer: response.text,
      }], ctx.from, groupId);
    } catch (error) {
      console.error("Error al procesar la imagen:", error);
      // En caso de error, también debes responder al remitente original
      this.sendFlowSimple("Ocurrió un error al procesar la imagen.", ctx.from, groupId);
    }
  };

  pdfAndSendToGPT = async (ctx, groupId) => {
    try {
      const buffer = await downloadMediaMessage(ctx, "buffer");
      const pathTmpPdf = `${process.cwd()}/tmp/document-${Date.now()}.pdf`;
      await fs.promises.writeFile(pathTmpPdf, buffer, null);
  
      // Leer el contenido del PDF usando pdf-parse
      const dataBuffer = await fs.promises.readFile(pathTmpPdf);
      const data = await pdf(dataBuffer); // Utiliza pdf para analizar el contenido del PDF
      const text = data.text;
  
      // Enviar el texto a la API de GPT-3.5 Turbo y manejar la respuesta
      const response = await this.openai.sendMessage(text, {
        conversationId: groupId ? groupId : undefined,
      });
  
      // Puedes enviar la respuesta al remitente original
      this.sendFlowSimple([{
        ...response,
        answer: response.text,
      }], ctx.from, groupId);
    } catch (error) {
      console.error("Error al procesar el documento PDF:", error);
      // En caso de error, también debes responder al remitente original
      this.sendFlowSimple("Ocurrió un error al procesar el documento PDF.", ctx.from, groupId);
    }
  };
  
  async downloadVideoFromPlatform(url) {
    try {
      if (url.includes('instagram.com')) {
        // Si la URL es de Instagram, descargar el video de Instagram
        const videoPath = await this.downloadVideoFromInstagram(url);
        return videoPath;
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        // Si la URL es de YouTube, descargar el video de YouTube
        const videoPath = await this.downloadVideoFromYouTube(url);
        return videoPath;
      } else if (url.includes('tiktok.com')) {
        // Si la URL es de TikTok, descargar el video de TikTok
        const videoPath = await this.downloadVideoFromTikTok(url);
        return videoPath;
      } else if (url.includes('facebook.com')) {
        // Si la URL es de Facebook, descargar el video de Facebook
        const videoPath = await this.downloadVideoFromFacebook(url);
        return videoPath;
      } else {
        console.error('URL de plataforma desconocida:', url);
        return null; // Retornar null para URLs desconocidas
      }
    } catch (error) {
      console.error('Error al descargar el video:', error.message);
      return null; // Retornar null en caso de error
    }
  }

  async downloadVideoFromYouTube(url) {
    try {
      const videoInfo = await ytdl.getInfo(url);
      const videoTitle = videoInfo.videoDetails.title;
  
      // Limpia el título para eliminar caracteres inválidos
      const cleanedVideoTitle = videoTitle.replace(/[\/:*?"<>|]/g, '_'); // Reemplaza los caracteres inválidos por guiones bajos
  
      // Obtén una lista de archivos en el directorio
      const files = fs.readdirSync('./tmp');
  
      // Encuentra el próximo número disponible para el nombre de archivo
      let videoFileName = `${cleanedVideoTitle}.mp4`;
      let fileNumber = 2;
      while (files.includes(videoFileName)) {
        videoFileName = `${cleanedVideoTitle}_${fileNumber}.mp4`;
        fileNumber++;
      }
  
      // Ruta donde se guardará el video
      const videoPath = `./tmp/${videoFileName}`;
  
      const videoStream = ytdl(url, { quality: 'highest' });
  
      // Crea una promesa para la descarga y resolución
      return new Promise(async (resolve, reject) => {
        const writeStream = fs.createWriteStream(videoPath);
  
        videoStream.pipe(writeStream);
  
        writeStream.on('finish', () => {
          resolve(videoPath); // Resuelve la promesa cuando la descarga se completa
        });
  
        writeStream.on('error', (error) => {
          reject(error); // Rechaza la promesa si hay un error
        });
      });
    } catch (error) {
      throw error;
    }
  }
  
  
  

  processCommand = async (ctx, command, groupId, isGroupMsg, from) => {
    
    try {
      console.log('Comando recibido:'); // Agregado para depuración
  
      if (command === '!menu') {
          // Responder al comando !menu con el menú de opciones
          console.log('Responder al comando !menu'); // Agregado para depuración
          const menuMessage = "¡Menú de opciones!\n\n1. !sticker: Crea un sticker con la última imagen enviada.\n2. !ayuda: Muestra la ayuda.";
          await this.sendFlowSimple([{
            answer: menuMessage
          }], ctx.from, groupId);
        } 
        else  if (command === '!sticker') {
               
      } 
      else if (command.startsWith('!descargar ')) {
        const urlToDownload = command.slice('!descargar '.length);
      
        if (urlToDownload) {
          const downloadedVideoPath = await this.downloadVideoFromPlatform(urlToDownload);
  
          if (downloadedVideoPath) {
            // El video se ha descargado con éxito, ahora puedes enviarlo
            const videoFileName = path.basename(downloadedVideoPath); // Obtén el nombre del archivo
            
            // Envía el video al usuario o grupo utilizando this.provider
            const phone = ctx.from + "@s.whatsapp.net";
            console.log(ctx);
            console.log(phone);
            console.log(downloadedVideoPath);
            await this.provider.sendMedia(phone, downloadedVideoPath, "mensaje de texto");
          } else {
            // Ocurrió un error al descargar el video
            console.error('Error al descargar el video.');
            // Responder al remitente original
            await this.sendFlowSimple("Ocurrió un error al descargar el video.", ctx.from, groupId);
          }
        } else {
          // La URL no se proporcionó en el comando
          // Responder al remitente original
          await this.sendFlowSimple("Por favor, proporciona una URL válida para descargar el video.", ctx.from, groupId);
        }
      }
    
      else if (command === '!ayuda') {
        // Responder al comando !ayuda con información de ayuda
        console.log('Responder al comando !ayuda'); // Agregado para depuración
        const ayudaMessage = "¡Bienvenido al bot de ayuda!\n\nSi necesitas ayuda puedes solicitarla al numero +573023606047 o en el siguiente enlace: www.wa.me/573023606047";
        await this.sendFlowSimple([{
          answer: ayudaMessage
        }], ctx.from, groupId);
      } else {
        // Responder a comandos no reconocidos
        console.log('Comando no reconocido:', command); // Agregado para depuración
        const unknownCommandMessage = "Comando no reconocido. ¡Escribe !menu para ver las opciones disponibles!";
        await this.sendFlowSimple([{
          answer: unknownCommandMessage
        }], ctx.from, groupId);
      }
    } catch (error) {
      console.error("Error al procesar el comando:", error);
      // En caso de error, también debes responder al remitente original
      await this.sendFlowSimple([{
        answer: "Ocurrió un error al procesar el comando."
      }], ctx.from, groupId);
    }
  };
  

  handleMsg = async (ctx) => {
    const { from, body, sender, isGroupMsg, messageType } = ctx;
    const groupId = isGroupMsg ? from : undefined; // Use the group ID as groupId if it's a group message

    // Verificar si el mensaje contiene el nombre "_event_voice_note__"
    if (body && body.includes("_event_voice_note__")) {
        // Procesar como una nota de voz como lo hiciste antes
        try {
          const buffer = await downloadMediaMessage(ctx, "buffer");
          const pathTmpOgg = `${process.cwd()}/tmp/voice-note-${Date.now()}.ogg`;
          const pathTmpMp3 = `${process.cwd()}/tmp/voice-note-${Date.now()}.mp3`;
          await fs.promises.writeFile(pathTmpOgg, buffer, null);
          await convertOggMp3(pathTmpOgg, pathTmpMp3);
          const text = await voiceToText(pathTmpMp3); // Transcribir la nota de voz a texto
      
          if (!this.queue[from]) {
            this.queue[from] = [];
          }
          const lastMessage = this.queue[from][this.queue[from].length - 1];
      
          // Enviar el texto a la API de GPT-3.5 Turbo y manejar la respuesta
          const response = await this.openai.sendMessage(text, {
            conversationId: groupId ? groupId : undefined,
            parentMessageId: lastMessage ? lastMessage.id : undefined, // No se proporciona un mensaje padre
          });
      
          this.queue[from].push(response);
      
          const parseMessage = {
            ...response,
            answer: response.text,
          };
      
          // Puedes enviar la respuesta al remitente original
          if (isGroupMsg) {
            // Si es un mensaje de grupo, responder al grupo
            this.sendFlowSimple([parseMessage], from, groupId);
          } else {
            // Si es un mensaje individual, responder al remitente original
            this.sendFlowSimple([parseMessage], from, groupId);
          }
      
          // No es necesario devolver nada aquí, ya que ya se envió la respuesta
        } catch (error) {
          console.error("Error al procesar la nota de voz:", error);
          // En caso de error, también debes responder al remitente original
          if (isGroupMsg) {
            await this.sendFlowSimple("Ocurrió un error al procesar la nota de voz.", from, groupId);
          } else {
            await this.sendFlowSimple("Ocurrió un error al procesar la nota de voz.", from, groupId);
          }
        }
      }
       else if (body && body.includes("_event_media__")) {
      // Si es un mensaje de imagen, realizar OCR y enviar el texto a GPT-3.5 Turbo
      this.ocrAndSendToGPT(ctx, groupId);
    } else if (body && body.includes("_event_document__")) {
        // Si es un documento PDF, procesarlo y enviar su contenido a GPT-3.5 Turbo
        this.pdfAndSendToGPT(ctx, groupId);
    } else if (body && body.startsWith('!')) {
        // Procesar comandos con "!"
        const commandWithSign = body.trim(); // Convierte a minúsculas y elimina espacios en blanco
        await this.processCommand(ctx, commandWithSign, groupId, isGroupMsg, from);
      } else {
      // El mensaje no es una nota de voz ni una imagen, procesarlo como un mensaje de texto
      if (!this.queue[from]) {
        this.queue[from] = [];
      }

      const lastMessage = this.queue[from][this.queue[from].length - 1];

      const completion = await this.openai.sendMessage(body, {
        conversationId: lastMessage ? lastMessage.conversationId : undefined,
        parentMessageId: lastMessage ? lastMessage.id : undefined,
      });

      this.queue[from].push(completion);

      const parseMessage = {
        ...completion,
        answer: completion.text,
      };

      this.sendFlowSimple([parseMessage], ctx.from, groupId);
    }
  };
}

module.exports = ChatGPTClass;
