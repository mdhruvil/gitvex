/**
 * Represents a flush packet, indicating the end of a message.
 */
export type FlushPkt = { type: "flush" };

/**
 * Represents a delimiter packet, separating sections of a message.
 */
export type DelimiterPkt = { type: "delim" };

/**
 * Represents a response end packet, indicating the end of a response for stateless connections.
 */
export type ResponseEndPkt = { type: "response-end" };

/**
 * Represents a data packet containing a Uint8Array payload.
 */
export type DataPkt = { type: "data"; data: Uint8Array };

/**
 * Represents an error packet with a message.
 */
export type ErrorPkt = { type: "error"; message: string };

/**
 * Represents a union of all possible packet types.
 */
export type Packet =
  | FlushPkt
  | DelimiterPkt
  | ResponseEndPkt
  | DataPkt
  | ErrorPkt;

/**
 * Git pkt-line parser for Git wire protocol version 2.
 * Implements encoding and decoding of pkt-line format used in Git smart HTTP protocol.
 *
 * Format: 4-byte hexadecimal length prefix + payload
 * Special packets: 0000 (flush), 0001 (delim), 0002 (response-end)
 *
 * @see https://git-scm.com/docs/protocol-v2
 * @see https://git-scm.com/docs/gitprotocol-pack
 */
export class PktLine {
  /** Flush packet - indicates end of message */
  static readonly FLUSH = "0000";

  /** Delimiter packet - separates sections of a message */
  static readonly DELIM = "0001";

  /** Response end packet - indicates end of response for stateless connections */
  static readonly RESPONSE_END = "0002";

  /** Maximum total packet size (4-byte header + payload) */
  static readonly MAX_PKT_SIZE = 65_520;

  /** Maximum payload size (MAX_PKT_SIZE - 4 byte header) */
  static readonly MAX_PAYLOAD_SIZE = 65_516;

  /** Error packet prefix */
  private static readonly ERR_PREFIX = "ERR ";

  /** Side-band channels */
  static readonly SIDEBAND_CHANNEL_PACKFILE = 1;
  static readonly SIDEBAND_CHANNEL_PROGRESS = 2;
  static readonly SIDEBAND_CHANNEL_ERROR = 3;

  /** Maximum side-band payload size (MAX_PKT_SIZE - 4 byte header - 1 byte for channel) */
  static readonly MAX_SIDEBAND_PAYLOAD = 65_515;

  /**
   * Encode data into a pkt-line format.
   * Accepts both Uint8Array and string (auto-converted to UTF-8).
   *
   * @param data - The data to encode
   * @returns Encoded pkt-line as Uint8Array
   * @throws Error if payload exceeds maximum size
   */
  static encode(data: Uint8Array | string): Uint8Array {
    const payload = typeof data === "string" ? PktLine.encodeText(data) : data;

    if (payload.length > PktLine.MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Payload size ${payload.length} exceeds maximum ${PktLine.MAX_PAYLOAD_SIZE}`
      );
    }

    const len = payload.byteLength + 4; // length includes the 4-byte header
    const header = new TextEncoder().encode(PktLine.formatPktLength(len));
    const out = new Uint8Array(header.byteLength + payload.byteLength);
    out.set(header, 0);
    out.set(payload, header.byteLength);

    return out;
  }

  /**
   * Encode a flush packet (0000).
   * Indicates end of message.
   *
   * @returns Flush packet as Uint8Array
   */
  static encodeFlush(): Uint8Array {
    return PktLine.encodeText(PktLine.FLUSH);
  }

  /**
   * Encode a delimiter packet (0001).
   * Separates sections of a message.
   *
   * @returns Delimiter packet as Uint8Array
   */
  static encodeDelim(): Uint8Array {
    return PktLine.encodeText(PktLine.DELIM);
  }

  /**
   * Encode a response-end packet (0002).
   * Indicates end of response for stateless connections.
   *
   * @returns Response-end packet as Uint8Array
   */
  static encodeResponseEnd(): Uint8Array {
    return PktLine.encodeText(PktLine.RESPONSE_END);
  }

  /**
   * Encode data for side-band-64k multiplexing.
   * Used in git-upload-pack to multiplex packfile data, progress, and error messages.
   *
   * @param channel - 1=packfile, 2=progress, 3=error
   * @param data - Payload data (max 65515 bytes)
   * @returns Pkt-line encoded side-band packet
   * @throws Error if payload exceeds maximum size
   */
  static encodeSideband(channel: 1 | 2 | 3, data: Uint8Array): Uint8Array {
    if (data.length > PktLine.MAX_SIDEBAND_PAYLOAD) {
      throw new Error(
        `Sideband payload exceeds ${PktLine.MAX_SIDEBAND_PAYLOAD} bytes`
      );
    }

    const packet = new Uint8Array(1 + data.length);
    packet[0] = channel;
    packet.set(data, 1);

    return PktLine.encode(packet);
  }

  /**
   * Helper to encode progress message for side-band channel 2.
   *
   * @param message - Progress message to send
   * @returns Encoded side-band progress packet
   */
  static encodeProgress(message: string): Uint8Array {
    return PktLine.encodeSideband(
      PktLine.SIDEBAND_CHANNEL_PROGRESS,
      PktLine.encodeText(message)
    );
  }

  /**
   * Helper to encode error message for side-band channel 3.
   *
   * @param message - Error message to send
   * @returns Encoded side-band error packet
   */
  static encodeSidebandError(message: string): Uint8Array {
    return PktLine.encodeSideband(
      PktLine.SIDEBAND_CHANNEL_ERROR,
      PktLine.encodeText(message)
    );
  }

  /**
   * Decode a pkt-line from buffer.
   * Automatically detects special packets (flush, delim, response-end) and error packets.
   *
   * @param buffer - The buffer containing pkt-line data
   * @returns Decoded packet
   * @throws Error if buffer is too short or contains invalid length
   */
  static decode(buffer: Uint8Array): Packet {
    if (buffer.length < 4) {
      throw new Error(
        `Buffer too short: ${buffer.length} bytes (need at least 4)`
      );
    }

    // Parse length header
    const lengthHex = PktLine.decodeText(buffer.slice(0, 4));

    // Check for special packets
    if (lengthHex === PktLine.FLUSH) {
      return { type: "flush" };
    }
    if (lengthHex === PktLine.DELIM) {
      return { type: "delim" };
    }
    if (lengthHex === PktLine.RESPONSE_END) {
      return { type: "response-end" };
    }

    // Parse length
    const length = PktLine.parsePktLength(buffer.slice(0, 4));

    if (buffer.length < length) {
      throw new Error(
        `Buffer too short: ${buffer.length} bytes (need ${length})`
      );
    }

    // Extract payload
    const data = buffer.slice(4, length);

    // Check for error packet (starts with "ERR ")
    if (data.length >= 4) {
      const prefix = PktLine.decodeText(data.slice(0, 4));
      if (prefix === PktLine.ERR_PREFIX) {
        const message = PktLine.decodeText(data.slice(4));
        return { type: "error", message };
      }
    }

    return { type: "data", data };
  }

  /**
   * Encode text data into a pkt-line format.
   * Convenience method for string payloads.
   *
   * @param text - The text to encode
   * @returns Encoded pkt-line as Uint8Array
   */
  static encodeText(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  /**
   * Decode pkt-line payload as text.
   * Convenience method for string payloads.
   *
   * @param data - The data to decode
   * @returns Decoded text
   */
  static decodeText(data: Uint8Array): string {
    return new TextDecoder().decode(data);
  }

  /**
   * Merge multiple pkt-line packets into a single buffer.
   * Useful for building complete protocol responses.
   *
   * @param lines - Array of pkt-line packets to merge
   * @returns Merged buffer containing all packets
   */
  static mergeLines(lines: Uint8Array[]): Uint8Array {
    const totalLength = lines.reduce((sum, line) => sum + line.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const line of lines) {
      merged.set(line, offset);
      offset += line.byteLength;
    }
    return merged;
  }

  /**
   * Parse 4-byte hexadecimal length header.
   *
   * @param header - 4-byte length header
   * @returns Parsed length value
   * @throws Error if header is invalid
   */
  private static parsePktLength(header: Uint8Array): number {
    if (header.length !== 4) {
      throw new Error(
        `Invalid length header: expected 4 bytes, got ${header.length}`
      );
    }

    const hex = PktLine.decodeText(header);
    const length = Number.parseInt(hex, 16);

    if (Number.isNaN(length)) {
      throw new Error(`Invalid hexadecimal length: ${hex}`);
    }

    if (length < 4) {
      throw new Error(`Invalid length: ${length} (must be at least 4)`);
    }

    if (length > PktLine.MAX_PKT_SIZE) {
      throw new Error(
        `Length ${length} exceeds maximum ${PktLine.MAX_PKT_SIZE}`
      );
    }

    return length;
  }

  /**
   * Format length as 4-digit hexadecimal string.
   *
   * @param length - Length value to format
   * @returns 4-digit hexadecimal string
   * @throws Error if length is invalid
   */
  private static formatPktLength(length: number): string {
    if (length < 0 || length > PktLine.MAX_PKT_SIZE) {
      throw new Error(
        `Invalid length: ${length} (must be 0-${PktLine.MAX_PKT_SIZE})`
      );
    }

    return length.toString(16).padStart(4, "0");
  }
}
