import { GoogleGenAI, Type } from "@google/genai";
import { PlaylistEntry, Track, TrackType, AppSettings } from "../types";

const getGeminiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please set process.env.API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

export const generatePlaylistStructure = async (
  tracks: Track[], 
  settings: AppSettings,
  historyNames: string[] // List of previously played track names/artists
): Promise<PlaylistEntry[]> => {
  const ai = getGeminiClient();

  // Create a simplified inventory for the model
  const inventory = tracks.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type,
    duration: Math.floor(t.duration)
  }));

  const prompt = `
    Você é um Programador de Rádio Automático (MixToPlay) experiente.
    
    Configurações do Usuário:
    - Duração Alvo do Bloco: ${settings.targetBlockDuration} minutos.
    - Comerciais por Bloco: ${settings.commercialsPerBlock} (Devem ir no final).
    
    Inventário disponível: ${JSON.stringify(inventory)}
    
    Histórico Recente (Faixas tocadas nos últimos 60 min):
    ${JSON.stringify(historyNames)}

    REGRAS DE ROTAÇÃO (CRÍTICO):
    1. Extração de Metadados: Considere que os nomes dos arquivos no inventário geralmente seguem o formato "Artista - Título".
    2. Rotação de Artista (60 min): Tente extrair o nome do ARTISTA do nome do arquivo. Se esse ARTISTA aparecer em qualquer parte do "Histórico Recente", NÃO escolha essa faixa, a menos que seja impossível preencher o tempo de outra forma.
    3. Rotação de Faixa (60 min): Se o nome exato da faixa estiver no histórico, ela está ESTRITAMENTE PROIBIDA.

    Regras de Estrutura:
    1. A soma das durações deve aproximar ${settings.targetBlockDuration * 60} segundos.
    2. SEQUÊNCIA PADRÃO OBRIGATÓRIA: Deve-se intercalar MÚSICA -> VINHETA -> MÚSICA -> VINHETA. Sempre que possível, após cada música, insira uma vinheta curta.
    3. COMERCIAIS: Devem ser agrupados em sequência EXATAMENTE no FINAL do bloco. Quantidade: ${settings.commercialsPerBlock}.
    4. O bloco deve começar com MÚSICA.
    
    Gere a playlist em formato JSON.
  `;

  // Define Schema for structured output
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        trackId: { type: Type.STRING, description: "ID exato do inventário" },
        trackName: { type: Type.STRING, description: "Nome da faixa" },
        type: { type: Type.STRING, enum: [TrackType.MUSIC, TrackType.JINGLE, TrackType.COMMERCIAL, TrackType.VOICE, TrackType.OTHER] },
        crossfadeDuration: { type: Type.NUMBER, description: "Duração recomendada da transição (use 0 se não houver mixagem)" }
      },
      required: ["trackId", "trackName", "type", "crossfadeDuration"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.5, // Lower temperature for stricter adherence to rules
      }
    });

    const text = response.text;
    if (!text) throw new Error("Sem resposta da IA");
    
    const playlistData = JSON.parse(text) as PlaylistEntry[];
    return playlistData;

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};