import 'dart:convert';

import 'package:freeu/backend/http/shared.dart';
import 'package:freeu/env/env.dart';
import 'package:freeu/utils/logger.dart';

/// 通知数据模型
class AppNotification {
  final String id;
  final String title;
  final String content;
  final DateTime timestamp;
  final String? todoId;
  final String? source;
  final String? aiSuggestion;

  AppNotification({
    required this.id,
    required this.title,
    required this.content,
    required this.timestamp,
    this.todoId,
    this.source,
    this.aiSuggestion,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String,
      title: json['title'] as String,
      content: json['content'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      todoId: json['todo_id'] as String?,
      source: json['source'] as String?,
      aiSuggestion: json['ai_suggestion'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'content': content,
      'timestamp': timestamp.toIso8601String(),
      if (todoId != null) 'todo_id': todoId,
      if (source != null) 'source': source,
      if (aiSuggestion != null) 'ai_suggestion': aiSuggestion,
    };
  }
}

/// 获取通知列表
Future<List<AppNotification>> getNotifications() async {
  try {
    final response = await makeApiCall(
      url: '${Env.apiBaseUrl}api/notifications',
      headers: {},
      method: 'GET',
      body: '',
    );

    if (response == null) {
      Logger.debug('Failed to get notifications: response is null');
      return [];
    }

    // Handle 404 and other errors gracefully
    if (response.statusCode == 404) {
      Logger.debug(
        'Notifications endpoint not found (404) - backend may not be running or endpoint not implemented',
      );
      return [];
    }

    if (response.statusCode != 200) {
      Logger.debug(
        'Failed to get notifications: ${response.statusCode} - ${response.body}',
      );
      return [];
    }

    // Check if response body is HTML (error page)
    final body = response.body;
    if (body.trim().startsWith('<!DOCTYPE') ||
        body.trim().startsWith('<html>')) {
      Logger.debug(
        'Received HTML instead of JSON - backend may not be running',
      );
      return [];
    }

    final List<dynamic> jsonList = jsonDecode(body);
    return jsonList
        .map((json) => AppNotification.fromJson(json as Map<String, dynamic>))
        .toList();
  } catch (e) {
    Logger.debug('Error getting notifications: $e');
    return [];
  }
}

/// Draft todo item returned by GET /api/todos?status=draft
class DraftTodo {
  final int id;
  final String name;
  final String? description;
  final DateTime createdAt;

  DraftTodo({
    required this.id,
    required this.name,
    this.description,
    required this.createdAt,
  });

  factory DraftTodo.fromJson(Map<String, dynamic> json) {
    return DraftTodo(
      id: json['id'] as int,
      name: (json['name'] ?? '') as String,
      description: json['description'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

/// 获取 draft 状态的待办（AI 自动识别、待用户确认）
Future<List<DraftTodo>> getDraftTodos({int limit = 5}) async {
  try {
    final response = await makeApiCall(
      url: '${Env.apiBaseUrl}api/todos?status=draft&limit=$limit&offset=0',
      headers: {},
      method: 'GET',
      body: '',
    );
    if (response == null || response.statusCode != 200) return [];
    final body = response.body;
    if (body.trim().startsWith('<!DOCTYPE') || body.trim().startsWith('<html>'))
      return [];
    final Map<String, dynamic> json = jsonDecode(body);
    final List<dynamic> todos = json['todos'] ?? [];
    return todos
        .map((j) => DraftTodo.fromJson(j as Map<String, dynamic>))
        .toList();
  } catch (e) {
    Logger.debug('Error getting draft todos: $e');
    return [];
  }
}

/// 接受 draft todo（将状态改为 active）
Future<bool> acceptDraftTodo(int todoId) async {
  try {
    final response = await makeApiCall(
      url: '${Env.apiBaseUrl}api/todos/$todoId',
      headers: {},
      method: 'PATCH',
      body: jsonEncode({'status': 'active'}),
    );
    return response != null && response.statusCode == 200;
  } catch (e) {
    Logger.debug('Error accepting draft todo: $e');
    return false;
  }
}

/// 忽略/取消 draft todo
Future<bool> dismissDraftTodo(int todoId) async {
  try {
    final response = await makeApiCall(
      url: '${Env.apiBaseUrl}api/todos/$todoId',
      headers: {},
      method: 'PATCH',
      body: jsonEncode({'status': 'canceled'}),
    );
    return response != null && response.statusCode == 200;
  } catch (e) {
    Logger.debug('Error dismissing draft todo: $e');
    return false;
  }
}

/// 删除通知
Future<bool> deleteNotification(String notificationId) async {
  try {
    final response = await makeApiCall(
      url: '${Env.apiBaseUrl}api/notifications/$notificationId',
      headers: {},
      method: 'DELETE',
      body: '',
    );

    if (response == null || response.statusCode != 200) {
      Logger.debug('Failed to delete notification: ${response?.statusCode}');
      return false;
    }

    final Map<String, dynamic> json = jsonDecode(response.body);
    return json['success'] as bool? ?? false;
  } catch (e) {
    Logger.debug('Error deleting notification: $e');
    return false;
  }
}

/// 保存FCM Token到服务器（用于通知服务）
Future<void> saveFcmTokenServer({
  required String token,
  required String timeZone,
}) async {
  try {
    // 这个方法应该在 users.dart 中，但为了兼容性先在这里实现
    // TODO: 移动到 users.dart 或创建专门的 token API
    final response = await makeApiCall(
      url: '${Env.apiBaseUrl}v1/users/fcm-token',
      headers: {},
      method: 'POST',
      body: jsonEncode({'token': token, 'timezone': timeZone}),
    );

    if (response == null || response.statusCode != 200) {
      Logger.debug('Failed to save FCM token: ${response?.statusCode}');
    }
  } catch (e) {
    Logger.debug('Error saving FCM token: $e');
  }
}
