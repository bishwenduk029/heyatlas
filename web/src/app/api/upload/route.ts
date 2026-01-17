import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// R2 S3 Client - configured for Cloudflare R2
const S3 = new S3Client({
  region: "auto", // Required by SDK but not used by R2
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType, content } = await request.json();

    if (!filename || !contentType || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate unique key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = filename.split(".").pop() || "";
    const key = `uploads/${timestamp}-${randomId}.${ext}`;

    // Decode base64 content to bytes
    // Handle both "data:mime;base64,abc123..." and plain base64 "abc123..."
    let bytes: Uint8Array;

    let base64Data = content;
    if (content.includes(",")) {
      base64Data = content.split(",")[1];
    }

    try {
      console.log("[Web API] Decoding base64 content, length:", base64Data.length);
      const binaryString = atob(base64Data);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log("[Web API] Decoded to bytes:", bytes.length);
    } catch (error) {
      // If atob fails, assume the content is already bytes/uint8array
      // This handles cases where frontend sends raw file data
      console.warn("[Web API] atob failed, treating as raw bytes:", error);
      const encoder = new TextEncoder();
      bytes = encoder.encode(content);
    }

    // Upload to R2 using S3 API
    console.log("[Web API] Uploading to R2 with S3 API...");
    await S3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        Body: bytes,
      }),
    );

    // Return public URL
    const publicUrl = process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL}/${key}`
      : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    console.log("[Web API] File uploaded to R2 successfully:", publicUrl);

    return NextResponse.json({
      url: publicUrl,
      key,
      success: true
    });

  } catch (error) {
    console.error("[Web API] Upload error:", error);

    const errorMessage = error instanceof Error ? error.message : "Upload failed";

    return NextResponse.json({
      error: errorMessage,
      success: false
    }, { status: 500 });
  }
}
