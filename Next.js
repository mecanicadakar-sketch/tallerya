import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt } = req.body;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction: `Eres un asistente virtual experto en auxilio mecánico y talleres mecánicos para la plataforma TallerYa en Paraguay. 
        Tu objetivo es dar diagnósticos preventivos rápidos a los conductores en ruta y sugerirles consultar la lista de talleres disponibles en TallerYa para grúas, gomerías o mecánica general.`
      }
    });

    res.status(200).json({ text: response.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
