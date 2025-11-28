import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { ChatMessage, KnowledgeGraph } from "../types";
import { buildGraphologyGraph } from "./graphService";

const API_KEY = process.env.API_KEY || '';
const getAiClient = () => new GoogleGenAI({ apiKey: API_KEY });

// --- Tool Definitions ---

const runGraphQueryTool: FunctionDeclaration = {
  name: "runGraphQuery",
  description: "Execute read-only JavaScript on the current Graphology graph instance 'g' and return the result. Use this to calculate metrics, filter nodes, or analyze topology using Graphology methods.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: { 
        type: Type.STRING, 
        description: "JavaScript code using the variable `g` (Graphology graph). Example: `g.nodes().filter(n => g.degree(n) > 5)` or `g.order`" 
      }
    },
    required: ["code"]
  }
};

// --- Main Chat Function ---

export async function chatWithAgent(
  history: ChatMessage[], 
  userMessage: string,
  graphContext: KnowledgeGraph
): Promise<{ text: string, reasoning: string, sources?: any[] }> {
    
    if (!API_KEY) throw new Error("API Key missing");
    const ai = getAiClient();

    const graphSummary = `Graph has ${graphContext.nodes.length} nodes and ${graphContext.edges.length} edges.`;

    const systemInstruction = `
      You are the "Endecja KG Builder" Agent.
      You have access to a real JavaScript interpreter with the 'graphology' library loaded as variable 'g'.
      
      TOOLS:
      - googleSearch: Use for external historical facts.
      - runGraphQuery: Use for counting, filtering, or analyzing the current graph structure.
      
      When asked about the graph (counts, centralities, paths), ALWAYS use 'runGraphQuery'.
      
      CRITICAL CONTEXT FROM REPORT:
      - "Poznań Cluster" (Wielkopolska) is the economic backbone.
      - Marian Seyda is a Bridge Node.
      - Regional isolation index is high.
      
      Reply in Polish unless asked otherwise. Be concise.
      Context: ${graphSummary}
    `;

    // Flatten history
    const contents = [
      ...history
        .filter(h => h.role !== 'system')
        .map(h => ({ 
          role: h.role === 'assistant' ? 'model' : 'user', 
          parts: [{ text: h.content }] 
        })),
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    try {
      const model = ai.getGenerativeModel({
         model: 'gemini-3-pro-preview',
         systemInstruction,
         tools: [{ googleSearch: {} }, { functionDeclarations: [runGraphQueryTool] }],
         thinkingConfig: { thinkingBudget: 4096 }
      });

      // We need to handle multi-turn function calling manually or use sendMessage loop. 
      // For simplicity in this functional component, we'll do a single turn with potential function execution.
      // But Gemini 3 Pro supports automatic tool use loops in ChatSession. Let's use ChatSession.
      
      const chat = model.startChat({
        history: history
          .filter(h => h.role !== 'system')
          .map(h => ({ 
             role: h.role === 'assistant' ? 'model' : 'user', 
             parts: [{ text: h.content }] 
          }))
      });

      const result = await chat.sendMessage(userMessage);
      
      // Check for function calls
      const calls = result.functionCalls;
      if (calls && calls.length > 0) {
        const responses = [];
        for (const call of calls) {
          if (call.name === 'runGraphQuery') {
            const jsCode = call.args.code;
            let output;
            try {
               const graphInstance = buildGraphologyGraph(graphContext);
               // Safe-ish sandbox
               const sandbox = { g: graphInstance, result: null };
               // Simple eval in a closure
               const func = new Function('g', `
                 try {
                   return eval(${JSON.stringify(jsCode)});
                 } catch(e) { return "Error: " + e.message; }
               `);
               output = func(graphInstance);
            } catch (e: any) {
               output = `Execution Error: ${e.message}`;
            }
            // Limit output size
            const outStr = JSON.stringify(output);
            responses.push({
              name: 'runGraphQuery',
              response: { result: outStr.substring(0, 2000) } // Truncate if huge
            });
          }
        }
        
        // Send tool results back
        const finalResult = await chat.sendMessage(responses);
        return {
          text: finalResult.response.text(),
          reasoning: "Executed graph query code.",
          sources: finalResult.response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((g: any) => ({
             title: g.web?.title || 'Source', uri: g.web?.uri || '#'
          }))
        };
      }

      return {
        text: result.response.text(),
        reasoning: "Direct response",
        sources: result.response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((g: any) => ({
             title: g.web?.title || 'Source', uri: g.web?.uri || '#'
          }))
      };

    } catch (e) {
      console.error(e);
      return { text: "Wystąpił błąd komunikacji z modelem.", reasoning: "" };
    }
}

export async function generateGraphExpansion(
  currentGraph: KnowledgeGraph, 
  query: string
): Promise<{ newNodes: any[], newEdges: any[], thoughtProcess: string }> {
  // Same as before but ensuring we import the types correctly
  const ai = getAiClient();
  const prompt = `
    You are an expert historian. Expand the graph based on: "${query}".
    Current Nodes: ${currentGraph.nodes.slice(0, 30).map(n => n.data.label).join(', ')}...
    Return JSON with new nodes/edges.
    Schema: { "thoughtProcess": "", "nodes": [{ "id": "", "label": "", "type": "", "dates": "", "region": "" }], "edges": [] }
  `;
  
  const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 8192 },
        tools: [{ googleSearch: {} }],
      }
    });

    let text = response.text || '';
    text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON from AI");
    }
}