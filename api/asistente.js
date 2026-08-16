import { GoogleGenAI } from '@google/genai';
import { getClientIp, checkRateLimit, sanitizeText } from './_security.js';

const GUIA_PRACTICA = `
GUÍA DE REFERENCIA DE AUXILIO MECÁNICO DE EMERGENCIA (PARAGUAY):

1. SEGURIDAD EN RUTA / EMERGENCIA:
- Estacionar a la derecha o banquina fuera del carril de circulación.
- Encender balizas de emergencia inmediatamente.
- Colocar triángulos de señalización a 30m y 50m atrás del vehículo.
- Usar chaleco refractario si tenés que bajarte en ruta o de noche.

2. AUTO NO ARRANCA / BATERÍA:
- Si no hay luces ni tablero: Batería descargada o bornes sulfatados. Probar arranque con cables de auxilio (puente).
- Si hay luces pero no gira el motor: Motor de arranque o solenoide/Bendix.
- Si el motor gira sin encender: Bomba/filtro de combustible o falta de chispa (bobina/bujías).

3. SOBRECALENTAMIENTO / RADIADOR:
- Parar el vehículo en lugar seguro y apagar el motor inmediatamente.
- NUNCA abrir la tapa del radiador o depósito con el motor caliente (riesgo de quemaduras graves por vapor).
- Revisar fugas bajo el auto, electroventilador o correa de bomba de agua una vez frío.

4. RUEDA PINCHADA / NEUMÁTICOS:
- Apoyar en superficie plana y firme. Poner freno de mano y marcha (o P en automático).
- Aflojar tuercas en cruz antes de levantar con gato hidráulico.

5. FRENOS Y RUIDOS RARIOS:
- Pedal esponjoso o chirrido metálico intenso: Desgaste severo de pastillas/discos o pérdida de líquido de freno.
- Humo o olor a quemado cerca de ruedas: Calibrado trabado o freno de mano presionado.
`;

const SYSTEM_PROMPT = `Sos el Asistente Experto en Auxilio Mecánico e Inteligencia Artificial de TallerYa Paraguay.
Tu objetivo es dar una primera orientación rápida, clara, segura y calmada ante emergencias mecánicas en ruta o ciudad.
Reglas:
1. Usá voseo paraguayo/rioplatense ("mirá", "revisá", "pará", "tenés").
2. Sé breve (máximo 130 palabras).
3. Si es una falla grave (temperatura, frenos, humo), primero recomendá medidas de seguridad en ruta (balizas, lugar seguro, apagar motor).
4. Explica brevemente la causa probable y qué revisar en el vehículo.
5. SIEMPRE terminá indicando que use el botón "Buscar ayuda cerca mío" o "Grúas y Auxilios" en TallerYa para contactar asistencia cercana inmediata en Paraguay.`;

function getLocalDiagnosis(mensaje) {
  const m = mensaje.toLowerCase();

  if (m.includes('arranca') || m.includes('bateria') || m.includes('batería') || m.includes('llave') || m.includes('puente')) {
    return 'Si al girar la llave no encienden luces ni tablero, la batería está descargada o los bornes sulfatados (podés intentar un puente de batería). Si encienden luces pero no gira el motor, suele ser el motor de arranque. Si el motor gira pero no prende, revisá combustible o chispa. Para auxilio inmediato o cambio de batería a domicilio, usá el botón "Buscar ayuda cerca mío" en TallerYa.';
  }
  if (m.includes('calienta') || m.includes('temperatura') || m.includes('radiador') || m.includes('agua') || m.includes('electro') || m.includes('vapor')) {
    return '¡Cuidado! Si sube la temperatura o sale vapor, pará inmediatamente en lugar seguro y apagá el motor. NUNCA abras la tapa del radiador en caliente (riesgo de quemaduras). Puede ser falta de refrigerante, termostato o electroventilador. Usá "Buscar ayuda cerca mío" en TallerYa para contactar una grúa o taller de auxilio mecánico.';
  }
  if (m.includes('rueda') || m.includes('pinch') || m.includes('gomeria') || m.includes('gomería') || m.includes('neumatico') || m.includes('neumático')) {
    return 'Si tenés una rueda pinchada, ubicá el auto en un terreno plano, poné balizas y freno de mano. Si necesitás un auxilio de gomería a domicilio o cambio de rueda en ruta, presioná el botón "Buscar ayuda cerca mío" en TallerYa para ubicar la gomería o auxilio móvil más cercano.';
  }
  if (m.includes('freno') || m.includes('ruido') || m.includes('chirrido') || m.includes('pastilla') || m.includes('pedal')) {
    return 'Un pedal suave, esponjoso o un chirrido metálico constante indica desgaste severo en pastillas, discos o fuga de líquido de frenos. Por seguridad no circules a alta velocidad. En TallerYa podés usar "Buscar ayuda cerca mío" para ubicar talleres de freno y auxilio vial.';
  }
  if (m.includes('aceite') || m.includes('humo') || m.includes('filtro') || m.includes('escape')) {
    return 'Humo azul por el escape señala consumo de aceite; humo blanco abundante o aceite lechoso puede indicar falla en la junta de tapa de cilindro. Verificá nivel de aceite con la varilla en frío. Te recomendamos consultar con los talleres registrados en TallerYa.';
  }
  if (m.includes('grua') || m.includes('grúa') || m.includes('remolque') || m.includes('auxilio') || m.includes('varado')) {
    return 'Si te quedaste varado en ruta o ciudad, encendé balizas de emergencia y poné los triángulos a distancia segura. Presioná de inmediato el botón "Buscar ayuda cerca mío" en TallerYa para ver el mapa de grúas y servicios de auxilio mecánico disponibles en tu zona.';
  }
  if (m.includes('check') || m.includes('luz') || m.includes('escaneo') || m.includes('inyeccion') || m.includes('inyección')) {
    return 'La luz de Check Engine indica una alerta detectada por la computadora del vehículo (sensores, inyección o catalizador). Si el auto no falla bruscamente podés circular despacio, pero conviene un escaneo computarizado. En TallerYa encontrás talleres con escáner cerca tuyo.';
  }

  return 'Para tu consulta sobre auxilio mecánico, te sugerimos verificar primero balizas, niveles de fluidos y fusibles por seguridad. Si la falla persiste o estás varado, usá el botón "Buscar ayuda cerca mío" en TallerYa para ubicar el taller, gomería o grúa más cercana en Paraguay.';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = getClientIp(req);
  // Rate limit AI requests: max 20 requests per minute per IP
  const rateStatus = checkRateLimit('ai_assistant', ip, 20, 60 * 1000);
  if (!rateStatus.allowed) {
    res.status(429).json({ error: 'Has alcanzado el límite de consultas al asistente de IA por minuto. Por favor esperá unos instantes.' });
    return;
  }

  const body = req.body || {};
  const rawMsg = (body.mensaje || body.prompt || '').toString();
  const mensaje = sanitizeText(rawMsg, 800);
  const historial = Array.isArray(body.historial) ? body.historial : [];

  if (!mensaje) {
    res.status(400).json({ error: 'Falta el mensaje.' });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: mensaje,
        config: {
          systemInstruction: SYSTEM_PROMPT
        }
      });
      return res.status(200).json({ ok: true, respuesta: response.text, text: response.text });
    } catch (err) {
      console.warn('[Gemini API notice, fallback to local diagnosis]:', err.message);
    }
  } else if (anthropicKey) {
    try {
      const messages = historial
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8)
        .map(m => ({ role: m.role, content: sanitizeText(m.content, 500) }));
      messages.push({ role: 'user', content: mensaje });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages
        })
      });
      const data = await r.json();
      if (r.ok) {
        const texto = (data.content || []).map(block => block.text || '').join('\n').trim();
        return res.status(200).json({ ok: true, respuesta: texto, text: texto });
      }
    } catch (err) {
      console.warn('[Anthropic API notice, fallback to local diagnosis]:', err.message);
    }
  }

  // Intelligent fallback response when API keys are not provided
  const localResp = getLocalDiagnosis(mensaje);
  return res.status(200).json({ ok: true, respuesta: localResp, text: localResp });
}


