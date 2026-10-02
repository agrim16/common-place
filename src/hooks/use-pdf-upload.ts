import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";
import { MAX_PDF_BYTES } from "@/lib/study";

/**
 * Upload a PDF straight into Convex file storage: the browser PUTs the bytes to
 * a short-lived signed URL, so a 20 MB document never passes through a
 * function argument (function payloads are far smaller than storage files).
 */
export function usePdfUpload() {
  const getUploadUrl = useMutation(api.study.generateUploadUrl);
  const register = useMutation(api.study.createNoteFile);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const upload = async (file: File): Promise<Id<"noteFiles">> => {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new Error("Only PDF files can be filed here.");
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        `That PDF is over the ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB limit.`,
      );
    }

    setBusy(true);
    try {
      setProgress(`Requesting a place for ${file.name}…`);
      const url = await getUploadUrl({});

      setProgress(`Uploading ${file.name} — ${formatMb(file.size)}…`);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!response.ok) {
        throw new Error("The upload was rejected — please try again.");
      }
      const { storageId } = (await response.json()) as { storageId: string };

      setProgress(`Filing ${file.name}…`);
      return await register({
        title: file.name.replace(/\.[^.]+$/, "") || "Worksheet",
        mimeType: "application/pdf",
        bytes: file.size,
        storageId,
      });
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return { upload, busy, progress };
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}