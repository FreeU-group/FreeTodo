import 'dart:convert';
import 'dart:io';

import 'package:freeu/backend/http/shared.dart';
import 'package:freeu/backend/schema/message.dart';
import 'package:freeu/env/env.dart';
import 'package:freeu/utils/logger.dart';
import 'package:freeu/utils/other/string_utils.dart';

String? _lastSessionId;

String? getCurrentMessageSessionId() => _lastSessionId;

void clearCurrentMessageSessionId() {
  _lastSessionId = null;
}

void _updateSessionIdFromHeaders(Map<String, String> headers) {
  final sid = headers['x-session-id'] ?? headers['X-Session-Id'];
  if (sid != null && sid.trim().isNotEmpty) {
    _lastSessionId = sid.trim();
  }
}

Future<List<ServerMessage>> getMessagesServer({
  String? appId,
  String? conversationId,
  String? sessionId,
  bool dropdownSelected = false,
}) async {
  if (appId == 'no_selected') appId = null;
  final usePinnedSession = (appId == null || appId.isEmpty) && (conversationId == null || conversationId.isEmpty);
  final effectiveSessionId =
      (sessionId == null || sessionId.isEmpty) ? (usePinnedSession ? _lastSessionId : null) : sessionId;
  final qConversationId = conversationId == null ? '' : '&conversation_id=$conversationId';
  final qSessionId = effectiveSessionId == null ? '' : '&session_id=$effectiveSessionId';
  final response = await makeApiCall(
    url:
        '${Env.apiBaseUrl}v2/messages?app_id=${appId ?? ''}&dropdown_selected=$dropdownSelected$qConversationId$qSessionId',
    headers: {},
    method: 'GET',
    body: '',
  );
  if (response == null || response.statusCode != 200) return [];

  _updateSessionIdFromHeaders(response.headers);

  final body = utf8.decode(response.bodyBytes);
  final decoded = jsonDecode(body);
  final rawList = decoded is List<dynamic>
      ? decoded
      : (decoded is Map<String, dynamic>
          ? (decoded['messages'] as List<dynamic>? ?? const <dynamic>[])
          : const <dynamic>[]);
  if (rawList.isEmpty) return [];

  final messages = rawList
      .whereType<Map<String, dynamic>>()
      .map((conversation) => ServerMessage.fromJson(conversation))
      .toList();
  Logger.debug('getMessages length: ${messages.length}, session=$_lastSessionId');
  return messages;
}

Future<List<ServerMessage>> clearChatServer({String? appId, String? conversationId, String? sessionId}) async {
  if (appId == 'no_selected') appId = null;
  final usePinnedSession = (appId == null || appId.isEmpty) && (conversationId == null || conversationId.isEmpty);
  final effectiveSessionId =
      (sessionId == null || sessionId.isEmpty) ? (usePinnedSession ? _lastSessionId : null) : sessionId;
  final qConversationId = conversationId == null ? '' : '&conversation_id=$conversationId';
  final qSessionId = effectiveSessionId == null ? '' : '&session_id=$effectiveSessionId';
  final response = await makeApiCall(
    url: '${Env.apiBaseUrl}v2/messages?app_id=${appId ?? ''}$qConversationId$qSessionId',
    headers: {},
    method: 'DELETE',
    body: '',
  );
  if (response == null) throw Exception('Failed to delete chat');
  if (response.statusCode == 200) {
    _updateSessionIdFromHeaders(response.headers);
    return [ServerMessage.fromJson(jsonDecode(response.body))];
  }
  throw Exception('Failed to delete chat');
}

ServerMessageChunk? parseMessageChunk(String line, String messageId) {
  final normalized = line.trim();
  if (normalized.isEmpty) return null;

  if (normalized.startsWith('think: ')) {
    return ServerMessageChunk(
      messageId,
      normalized.substring(7).replaceAll('__CRLF__', '\n'),
      MessageChunkType.think,
    );
  }

  if (normalized.startsWith('data: ')) {
    return ServerMessageChunk(
      messageId,
      normalized.substring(6).replaceAll('__CRLF__', '\n'),
      MessageChunkType.data,
    );
  }

  if (normalized.startsWith('done: ')) {
    final text = decodeBase64(normalized.substring(6));
    return ServerMessageChunk(
      messageId,
      text,
      MessageChunkType.done,
      message: ServerMessage.fromJson(json.decode(text)),
    );
  }

  if (normalized.startsWith('message: ')) {
    final text = decodeBase64(normalized.substring(9));
    return ServerMessageChunk(
      messageId,
      text,
      MessageChunkType.message,
      message: ServerMessage.fromJson(json.decode(text)),
    );
  }

  if (normalized.startsWith('error: ')) {
    return ServerMessageChunk(messageId, normalized.substring(7), MessageChunkType.error);
  }

  return null;
}

Stream<ServerMessageChunk> sendMessageStreamServer(
  String text, {
  String? appId,
  String? conversationId,
  String? sessionId,
  List<String>? filesId,
}) async* {
  final usePinnedSession = (appId == null || appId.isEmpty) && (conversationId == null || conversationId.isEmpty);
  final effectiveSessionId =
      (sessionId == null || sessionId.isEmpty) ? (usePinnedSession ? _lastSessionId : null) : sessionId;

  var url = '${Env.apiBaseUrl}v2/messages?app_id=$appId';
  if (appId == null || appId.isEmpty || appId == 'null' || appId == 'no_selected') {
    url = '${Env.apiBaseUrl}v2/messages';
  }
  if (conversationId != null && conversationId.isNotEmpty) {
    url += (url.contains('?') ? '&' : '?') + 'conversation_id=$conversationId';
  }
  if (effectiveSessionId != null && effectiveSessionId.isNotEmpty) {
    url += (url.contains('?') ? '&' : '?') + 'session_id=$effectiveSessionId';
  }

  const messageId = '1000';
  var receivedAnyChunk = false;

  await for (final line in makeStreamingApiCall(
    url: url,
    body: jsonEncode({'text': text, 'file_ids': filesId}),
  )) {
    final messageChunk = parseMessageChunk(line, messageId);
    if (messageChunk != null) {
      receivedAnyChunk = true;
      yield messageChunk;
    }
  }

  if (receivedAnyChunk) return;

  // Fallback: some tunnels/proxies may break streaming; retry as normal POST.
  final response = await makeApiCall(
    url: url,
    headers: {},
    method: 'POST',
    body: jsonEncode({'text': text, 'file_ids': filesId}),
  );
  if (response == null) {
    yield ServerMessageChunk.failedMessage();
    return;
  }

  _updateSessionIdFromHeaders(response.headers);

  if (response.statusCode != 200) {
    yield ServerMessageChunk(
      messageId,
      '聊天请求失败（HTTP ${response.statusCode}）',
      MessageChunkType.error,
    );
    return;
  }

  final body = utf8.decode(response.bodyBytes);
  final parts = body.split('\n\n');
  var parsed = false;
  for (final part in parts) {
    final chunk = parseMessageChunk(part, messageId);
    if (chunk != null) {
      parsed = true;
      yield chunk;
    }
  }

  if (!parsed) {
    yield ServerMessageChunk(
      messageId,
      body.trim().isEmpty ? '聊天请求失败，请稍后重试。' : body,
      MessageChunkType.error,
    );
  }
}

/// Sends a chat message using the Agno mode (same as PC frontend).
///
/// Calls `POST /api/chat/stream` with `mode: "agno"`, reads the raw
/// streaming response, filters out `[TOOL_EVENT:...]` markers, and yields
/// the text content as [ServerMessageChunk]s.
Stream<ServerMessageChunk> sendMessageAgnoStreamServer(String text) async* {
  final url = '${Env.apiBaseUrl}api/chat/stream';
  const messageId = '1000';

  final bodyMap = <String, dynamic>{
    'message': text,
    'mode': 'agno',
  };
  if (_lastSessionId != null && _lastSessionId!.isNotEmpty) {
    bodyMap['conversation_id'] = _lastSessionId;
  }

  var receivedAnyChunk = false;

  try {
    final response = await makeRawApiCall(
      url: url,
      method: 'POST',
      body: jsonEncode(bodyMap),
    );

    _updateSessionIdFromHeaders(response.headers);

    if (response.statusCode != 200) {
      final reason = await response.stream.bytesToString();
      yield ServerMessageChunk(
        messageId,
        '聊天请求失败（HTTP ${response.statusCode}）${reason.isNotEmpty ? ': $reason' : ''}',
        MessageChunkType.error,
      );
      return;
    }

    const toolPrefix = '\n[TOOL_EVENT:';
    const toolSuffix = ']\n';
    var buffer = '';

    await for (final data in response.stream.transform(utf8.decoder)) {
      buffer += data;

      while (buffer.isNotEmpty) {
        final toolIdx = buffer.indexOf(toolPrefix);

        if (toolIdx < 0) {
          receivedAnyChunk = true;
          yield ServerMessageChunk(messageId, buffer, MessageChunkType.data);
          buffer = '';
          break;
        }

        if (toolIdx > 0) {
          receivedAnyChunk = true;
          yield ServerMessageChunk(messageId, buffer.substring(0, toolIdx), MessageChunkType.data);
          buffer = buffer.substring(toolIdx);
        }

        final endIdx = buffer.indexOf(toolSuffix, toolPrefix.length);
        if (endIdx < 0) break;

        buffer = buffer.substring(endIdx + toolSuffix.length);
      }
    }

    final remaining = buffer.trim();
    if (remaining.isNotEmpty && !remaining.startsWith('[TOOL_EVENT:')) {
      receivedAnyChunk = true;
      yield ServerMessageChunk(messageId, remaining, MessageChunkType.data);
    }
  } catch (e) {
    Logger.error('Agno stream error: $e');
    yield ServerMessageChunk(messageId, '请求失败: $e', MessageChunkType.error);
    return;
  }

  if (!receivedAnyChunk) {
    yield ServerMessageChunk(messageId, '未收到回复，请检查中心节点连接。', MessageChunkType.error);
  }
}

Future<ServerMessage> getInitialAppMessage(String? appId) {
  return makeApiCall(
    url: '${Env.apiBaseUrl}v2/initial-message?app_id=$appId',
    headers: {},
    method: 'POST',
    body: '',
  ).then((response) {
    if (response == null) throw Exception('Failed to send message');
    if (response.statusCode == 200) {
      return ServerMessage.fromJson(jsonDecode(response.body));
    }
    throw Exception('Failed to send message');
  });
}

Stream<ServerMessageChunk> sendVoiceMessageStreamServer(List<File> files, {String? language}) async* {
  const messageId = '1000';

  await for (final line in makeMultipartStreamingApiCall(
    url: '${Env.apiBaseUrl}v2/voice-messages',
    files: files,
    fields: language != null ? {'language': language} : {},
  )) {
    final messageChunk = parseMessageChunk(line, messageId);
    if (messageChunk != null) {
      yield messageChunk;
    }
  }
}

Future<List<MessageFile>?> uploadFilesServer(List<File> files, {String? appId}) async {
  var url = '${Env.apiBaseUrl}v2/files?app_id=$appId';
  if (appId == null || appId.isEmpty || appId == 'null' || appId == 'no_selected') {
    url = '${Env.apiBaseUrl}v2/files';
  }

  try {
    final response = await makeMultipartApiCall(
      url: url,
      files: files,
    );

    if (response.statusCode == 200) {
      Logger.debug('uploadFileServer response body: ${jsonDecode(response.body)}');
      return MessageFile.fromJsonList(jsonDecode(response.body));
    }
    Logger.debug('Failed to upload file. Status code: ${response.statusCode} ${response.body}');
    throw Exception('Failed to upload file. Status code: ${response.statusCode}');
  } catch (e) {
    Logger.debug('An error occurred uploadFileServer: $e');
    throw Exception('An error occurred uploadFileServer: $e');
  }
}

Future reportMessageServer(String messageId) async {
  final response = await makeApiCall(
    url: '${Env.apiBaseUrl}v2/messages/$messageId/report',
    headers: {},
    method: 'POST',
    body: '',
  );
  if (response == null) throw Exception('Failed to report message');
  if (response.statusCode != 200) {
    throw Exception('Failed to report message');
  }
}

Future<String> transcribeVoiceMessage(File audioFile, {String? language}) async {
  try {
    final response = await makeMultipartApiCall(
      url: '${Env.apiBaseUrl}v2/voice-message/transcribe',
      files: [audioFile],
      fields: language != null ? {'language': language} : {},
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['transcript'] ?? '';
    }

    Logger.debug('Failed to transcribe voice message: ${response.statusCode} ${response.body}');
    throw Exception('Failed to transcribe voice message');
  } catch (e) {
    Logger.debug('Error transcribing voice message: $e');
    throw Exception('Error transcribing voice message: $e');
  }
}
