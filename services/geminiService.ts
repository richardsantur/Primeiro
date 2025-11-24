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

  const hasCommercials = inventory.some(t => t.type === TrackType.COMMERCIAL);
  const isLongBlock = settings.targetBlockDuration >= 55; // Consider blocks close to 60m as long blocks

  // --- Dynamic Rules Construction ---

  // 1. Commercial Logic
  let commercialRule = "";
  if (!hasCommercials) {
    commercialRule = `
    REGRA DE OURO (COMERCIAIS): O inventário NÃO possui arquivos do tipo 'COMMERCIAL'. 
    Portanto, NÃO insira nenhum item 'COMMERCIAL' na playlist. IGNORE a configuração de "Comerciais por Bloco".
    `;
  } else if (isLongBlock) {
    commercialRule = `
    REGRA DE OURO (COMERCIAIS - BLOCO LONGO):
    Como este é um bloco de longa duração (${settings.targetBlockDuration} min), NÃO coloque os comerciais no final.
    Insira o bloco de comerciais (quantidade: ${settings.commercialsPerBlock}) EXATAMENTE quando a playlist atingir aproximadamente 30 minutos de duração (Meio do bloco).
    `;
  } else {
    commercialRule = `
    REGRA DE OURO (COMERCIAIS): 
    Devem ser agrupados em sequência perto do FINAL do bloco (mas antes do Encerramento, se houver). 
    Quantidade: ${settings.commercialsPerBlock}.
    `;
  }

  // 2. 'Other' Logic (News/Frames)
  let otherRule = "";
  if (isLongBlock) {
    otherRule = `
    CONTEÚDO 'OTHER' (QUADROS/NOTÍCIAS) - BLOCO LONGO:
    Devem ser inseridos JUNTAMENTE com os comerciais, por volta da marca de 30 minutos (Meio da programação).
    `;
  } else {
    otherRule = `
    CONTEÚDO 'OTHER' (QUADROS/NOTÍCIAS): 
    Esses conteúdos são "Livres" e "Flutuantes". Eles PODEM e DEVEM ser posicionados em qualquer ponto entre as músicas para enriquecer a programação.
    `;
  }

  const prompt = `
    Você é um Programador de Rádio Automático (MixToPlay) experiente.
    
    Configurações do Usuário:
    - Duração Alvo do Bloco: ${settings.targetBlockDuration} minutos.
    
    Inventário disponível: ${JSON.stringify(inventory)}
    
    Histórico Recente (Faixas tocadas nos últimos 60 min):
    ${JSON.stringify(historyNames)}

    REGRAS DE ROTAÇÃO (CRÍTICO):
    1. Extração de Metadados: Considere que os nomes dos arquivos no inventário geralmente seguem o formato "Artista - Título".
    2. Rotação de Artista (60 min): Tente extrair o nome do ARTISTA do nome do arquivo. Se esse ARTISTA aparecer em qualquer parte do "Histórico Recente", NÃO escolha essa faixa, a menos que seja impossível preencher o tempo de outra forma.
    3. Rotação de Faixa (60 min): Se o nome exato da faixa estiver no histórico, ela está ESTRITAMENTE PROIBIDA.

    Regras de Estrutura:
    1. A soma das durações deve aproximar ${settings.targetBlockDuration * 60} segundos.
    2. SEQUÊNCIA BASE: A estrutura predominante deve ser MÚSICA -> VINHETA -> MÚSICA -> VINHETA.
    
    3. ABERTURA E ENCERRAMENTO ('OPENING_CLOSING'):
       - Se houver uma faixa 'OPENING_CLOSING' cujo nome sugira "abertura", "inicio", "intro", ela DEVE ser obrigatoriamente a primeira faixa do bloco (index 0).
       - Se houver uma faixa 'OPENING_CLOSING' cujo nome sugira "encerramento", "final", "fechamento", ela DEVE ser obrigatoriamente a última faixa do bloco.

    ${commercialRule}

    ${otherRule}
    
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
        type: { type: Type.STRING, enum: [TrackType.MUSIC, TrackType.JINGLE, TrackType.COMMERCIAL, TrackType.VOICE, TrackType.OTHER, TrackType.OPENING_CLOSING] },
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
