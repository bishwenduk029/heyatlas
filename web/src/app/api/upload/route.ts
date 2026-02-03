import { NextRequest, NextResponse } from "next/server";

// Use fetch-based S3 API instead of heavy AWS SDK
async function uploadToR2(key: string, body: Uint8Array, contentType: string) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const bucket = process.env.R2_BUCKET_NAME || "";
  
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateShort = date.slice(0, 8);
  
  // Create signing key (AWS Signature v4)
  const encoder = new TextEncoder();
  
  async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  }
  
  async function sha256(message: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", message);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  
  const payloadHash = await sha256(body);
  
  const headers: Record<string, string> = {
    "x-amz-date": date,
    "x-amz-content-sha256": payloadHash,
    "content-type": contentType,
    "host": `${accountId}.r2.cloudflarestorage.com`,
  };
  
  // Canonical request
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}`).join("\n") + "\n";
  const canonicalRequest = `PUT\n/${bucket}/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const canonicalRequestHash = await sha256(encoder.encode(canonicalRequest));
  
  // String to sign
  const scope = `${dateShort}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${canonicalRequestHash}`;
  
  // Signing key
  const kDate = await hmac(encoder.encode("AWS4" + secretAccessKey), dateShort);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  
  // Signature
  const signatureBuffer = await hmac(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  
  // Authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body: body,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed: ${response.status} ${text}`);
  }
  
  return url;
}

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
    let bytes: Uint8Array;
    let base64Data = content;
    if (content.includes(",")) {
      base64Data = content.split(",")[1];
    }

    try {
      const binaryString = atob(base64Data);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    } catch {
      const encoder = new TextEncoder();
      bytes = encoder.encode(content);
    }

    // Upload to R2
    await uploadToR2(key, bytes, contentType);

    // Return public URL
    const publicUrl = process.env.R2_PUBLIC_URL
      ? `${process.env.R2_PUBLIC_URL}/${key}`
      : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    return NextResponse.json({
      url: publicUrl,
      key,
      success: true
    });

  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Upload failed",
      success: false
    }, { status: 500 });
  }
}
