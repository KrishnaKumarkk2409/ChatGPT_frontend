import { ChatMessageType, ModalList, useSettings } from "../store/store";

const CHAT_API_URL = "http://18.210.106.165:7860/api/v1/run/d8937800-9764-4f9c-b1f7-3c3f6573064c";
const IMAGE_GENERATION_API_URL = "https://api.openai.com/v1/images/generations";

export async function fetchResults(
  messages: Omit<ChatMessageType, "id" | "type">[],
  modal: string,
  signal: AbortSignal,
  onData: (data: string) => void,
  onCompletion: () => void
) {
  // 1. Serialize your message history into a single string.
  //    You can customize this formatting however your API expects.
  const chatInput = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  // 2. Build the payload exactly as your custom API wants it.
  const payload = {
    input_value: chatInput,
    input_type: "chat",
    output_type: "chat",
  };

  try {
    const res = await fetch(CHAT_API_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Chat API error:", res.status, errText);
      throw new Error(`Chat API returned ${res.status}`);
    }

    // 3. Read back the full response (custom API returns JSON).
    const json = await res.json();

    // 4. Drill into the nested structure and pull out the reply message.
    const reply =
      json.outputs?.[0]?.outputs?.[0]?.results?.text ||
      json.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text ||
      "";

    // 5. Send only that string (the AI's response) to the callback function.
    onData(reply);
    onCompletion();

  } catch (error: any) {
    console.error("fetchResults error:", error);
    throw error;
  }
}

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

export async function generateImage(
  prompt: string,
  size: ImageSize,
  numberOfImages: number
) {
  const selectedModal = useSettings.getState().settings.selectedModal;

  const response = await fetch(IMAGE_GENERATION_API_URL, {
    method: "POST",
    headers: {
      "content-type": `application/json`,
      accept: `text/event-stream`,
      Authorization: `Bearer ${localStorage.getItem("apikey")}`,
    },
    body: JSON.stringify({
      model: selectedModal,
      prompt: prompt,
      n: numberOfImages,
      size: useSettings.getState().settings.dalleImageSize[
        selectedModal as DallEImageModel
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Image API error ${response.status}: ${err}`);
  }
  return (await response.json()) as IMAGE_RESPONSE;
}
