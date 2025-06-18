// src/api/chatAndImageApi.tsx

import { ChatMessageType, ModalList, useSettings } from "../store/store";

const CHAT_API_URL = "https://langflow.encap.ai/api/v1/run/23ad6eee-ca2a-44b9-998b-70ce5548ec3d";
const IMAGE_GENERATION_API_URL = "https://api.openai.com/v1/images/generations";

/**
 * Streams chat responses from LangFlow and calls onData for each piece of text.
 */
export async function fetchResults(
  messages: Omit<ChatMessageType, "id" | "type">[],
  modal: string,
  signal: AbortSignal,
  onData: (data: string) => void,
  onCompletion: () => void
) {
  // 1. Serialize the message history into a single prompt string
  const chatInput = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  // 2. Build the payload, requesting streaming
  const payload = {
    input_value: chatInput,
    input_type: "chat",
    output_type: "chat",
    stream: true, // <-- Tell LangFlow to stream the response
  };

  try {
    const res = await fetch(CHAT_API_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream", // <-- Indicate that we want SSE-style streaming
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Chat API error:", res.status, errText);
      throw new Error(`Chat API returned ${res.status}`);
    }

    if (!res.body) {
      throw new Error("ReadableStream not supported by environment.");
    }

    // 3. Read the response as a stream of SSE lines
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by "\n\n". Process each event as it arrives.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);

        if (chunk.startsWith("data:")) {
          const raw = chunk.replace(/^data:\s*/, "");
          if (raw === "[DONE]") {
            // End of stream sentinel
            onCompletion();
            return;
          }

          try {
            const parsed = JSON.parse(raw);
            // Drill into JSON to find incremental content.
            // Example structure: { choices: [ { delta: { content: "..." } } ] }
            const delta =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.text ??
              "";
            if (delta) {
              onData(delta);
            }
          } catch {
            // If it's not valid JSON, just send raw text
            onData(raw);
          }
        }

        boundary = buffer.indexOf("\n\n");
      }
    }

    // In case the stream ends without explicit "[DONE]"
    onCompletion();
  } catch (error: any) {
    console.error("fetchResults error:", error);
    throw error;
  }
}

/**
 * Fetches the list of available OpenAI models.
 */
export async function fetchModals() {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("apikey")}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Model‐list API returned ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error("fetchModals error:", error);
    throw error;
  }
}

export type ImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1280x720"
  | "1920x1080"
  | "1792x1024"
  | "1024x1792";

export type IMAGE_RESPONSE = {
  created_at: string;
  data: IMAGE[];
};
export type IMAGE = {
  url: string;
};
export type DallEImageModel = Extract<ModalList, "dall-e-2" | "dall-e-3">;

/**
 * Generates images using OpenAI's Image API.
 */
export async function generateImage(
  prompt: string,
  size: ImageSize,
  numberOfImages: number
) {
  const selectedModal = useSettings.getState().settings.selectedModal;

  const response = await fetch(IMAGE_GENERATION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream", // If your front-end expects SSE, keep this. Otherwise "application/json" is fine.
      Authorization: `Bearer ${localStorage.getItem("apikey")}`,
    },
    body: JSON.stringify({
      model: selectedModal,
      prompt,
      n: numberOfImages,
      size: useSettings.getState().settings.dalleImageSize[
        selectedModal as DallEImageModel
      ],
      stream: false, // Dall-E image endpoints typically do not stream; set false
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Image API error ${response.status}: ${err}`);
  }

  return (await response.json()) as IMAGE_RESPONSE;
}
