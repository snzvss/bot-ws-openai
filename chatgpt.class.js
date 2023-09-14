const { CoreClass } = require("@bot-whatsapp/bot");
const { downloadMediaMessage } = require('@adiwajshing/baileys');
const fs = require('fs');
const pdf = require('pdf-parse');
const { convertOggMp3 } = require('./services/convert');
const { voiceToText } = require('./services/whisper');
const { createWorker } = require('tesseract.js');

class ChatGPTClass extends CoreClass {
  queue = [];
  optionsGPT = { model: "text-davinci-003" };
  openai = undefined;

  constructor(_database, _provider) {
    super(null, _database, _provider);
    this.init().then();
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
    }else {
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

      // Enviar la respuesta al remitente original
      this.sendFlowSimple([parseMessage], ctx.from, groupId); // Pass groupId for group messages
    }
  };
}

module.exports = ChatGPTClass;
