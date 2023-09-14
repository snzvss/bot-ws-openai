const { CoreClass } = require("@bot-whatsapp/bot");
const { downloadMediaMessage } = require('@adiwajshing/baileys');
const fs = require('node:fs/promises');
const { convertOggMp3 } = require('./services/convert');
const { voiceToText, sendToOpenAI } = require('./services/whisper');

class ChatGPTClass extends CoreClass {
  queue = [];
  optionsGPT = {model: "text-davinci-003"};
  openai = undefined;

  constructor(_database, _provider){
    super(null, _database, _provider);
    /*this.optionsGPT = { ...this.optionsGPT, ..._optionsGPT};*/
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

  handleMsg = async (ctx) => {
    const { from, body, sender, isGroupMsg, messageType } = ctx;
    const groupId = isGroupMsg ? from : undefined; // Use the group ID as groupId if it's a group message

    if (messageType === 'audio') {
      try {
        const buffer = await downloadMediaMessage(ctx, "buffer");
        const pathTmpOgg = `${process.cwd()}/tmp/voice-note-${Date.now()}.ogg`;
        const pathTmpMp3 = `${process.cwd()}/tmp/voice-note-${Date.now()}.mp3`;
        await fs.writeFile(pathTmpOgg, buffer);
        await convertOggMp3(pathTmpOgg, pathTmpMp3);
        const text = await voiceToText(pathTmpMp3);

        // Enviar el texto a la API de OpenAI y manejar la respuesta
        const response = await sendToOpenAI(text);

        // Puedes enviar la respuesta al usuario o hacer lo que desees con ella
        // Por ejemplo, aquí simplemente se devuelve el texto como respuesta
        return response;
      } catch (error) {
        console.error("Error al procesar la nota de voz:", error);
        return "Ocurrió un error al procesar la nota de voz.";
      }
    } else {
      // El mensaje no es una nota de voz, procesarlo como un mensaje de texto
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

      this.sendFlowSimple([parseMessage], from, groupId); // Pass groupId for group messages
    }
  };
}

module.exports = ChatGPTClass;
