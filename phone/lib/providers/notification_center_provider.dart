import 'dart:async';

import 'package:flutter/material.dart';

import 'package:freeu/backend/http/api/notifications.dart';
import 'package:freeu/env/env.dart';

class NotificationCenterProvider extends ChangeNotifier {
  List<AppNotification> _notifications = <AppNotification>[];
  List<DraftTodo> _draftTodos = <DraftTodo>[];
  final Set<String> _laterIds = <String>{};
  bool _loading = false;
  bool _useMockData = false;
  DateTime? _lastLoadedAt;
  DateTime? _lastDraftPollAt;
  StreamSubscription<String>? _apiBaseUrlSub;

  Timer? _notificationTimer;
  Timer? _draftTodoTimer;

  static const _notificationInterval = Duration(seconds: 10);
  static const _draftTodoInterval = Duration(seconds: 5);

  NotificationCenterProvider() {
    _apiBaseUrlSub = Env.onApiBaseUrlChanged.listen((_) async {
      await refresh(force: true);
      await pollDraftTodos(force: true);
    });
  }

  List<AppNotification> get notifications => _notifications;
  List<DraftTodo> get draftTodos => _draftTodos;
  Set<String> get laterIds => _laterIds;
  bool get loading => _loading;
  bool get useMockData => _useMockData;
  DateTime? get lastLoadedAt => _lastLoadedAt;
  int get pendingCount =>
      _notifications.where((n) => !_laterIds.contains(n.id)).length +
      _draftTodos.length;

  /// Start background polling timers. Call once from HomePage.initState.
  void startPolling() {
    _notificationTimer?.cancel();
    _draftTodoTimer?.cancel();

    unawaited(refresh(force: true));
    unawaited(pollDraftTodos(force: true));

    _notificationTimer = Timer.periodic(_notificationInterval, (_) {
      unawaited(refresh());
    });
    _draftTodoTimer = Timer.periodic(_draftTodoInterval, (_) {
      unawaited(pollDraftTodos());
    });
  }

  /// Stop background polling. Call when app goes to background.
  void stopPolling() {
    _notificationTimer?.cancel();
    _notificationTimer = null;
    _draftTodoTimer?.cancel();
    _draftTodoTimer = null;
  }

  Future<void> setUseMockData(bool value) async {
    if (_useMockData == value) return;
    _useMockData = value;
    _lastLoadedAt = null;
    notifyListeners();
    await refresh(force: true);
  }

  Future<void> refresh({bool force = false}) async {
    if (_loading) return;
    if (!force && _lastLoadedAt != null && DateTime.now().difference(_lastLoadedAt!).inSeconds < 8) {
      return;
    }

    _loading = true;
    notifyListeners();
    try {
      if (_useMockData) {
        _notifications = _mockNotifications();
      } else {
        final data = await getNotifications();
        _notifications = data;
      }
      _laterIds.removeWhere((id) => !_notifications.any((n) => n.id == id));
      _lastLoadedAt = DateTime.now();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Poll for draft todos (AI-detected, pending user confirmation).
  Future<void> pollDraftTodos({bool force = false}) async {
    if (!force && _lastDraftPollAt != null && DateTime.now().difference(_lastDraftPollAt!).inSeconds < 4) {
      return;
    }
    try {
      _draftTodos = await getDraftTodos(limit: 10);
      _lastDraftPollAt = DateTime.now();
      notifyListeners();
    } catch (_) {}
  }

  /// Accept a draft todo (move to active).
  Future<bool> acceptDraft(int todoId) async {
    final ok = await acceptDraftTodo(todoId);
    if (ok) {
      _draftTodos.removeWhere((t) => t.id == todoId);
      notifyListeners();
    }
    return ok;
  }

  /// Dismiss/cancel a draft todo.
  Future<bool> dismissDraft(int todoId) async {
    final ok = await dismissDraftTodo(todoId);
    if (ok) {
      _draftTodos.removeWhere((t) => t.id == todoId);
      notifyListeners();
    }
    return ok;
  }

  void markLater(String id) {
    _laterIds.add(id);
    notifyListeners();
  }

  void clearLater(String id) {
    _laterIds.remove(id);
    notifyListeners();
  }

  Future<bool> acceptOrIgnore(String id) async {
    final ok = _useMockData ? true : await deleteNotification(id);
    if (!ok) return false;
    _notifications = _notifications.where((n) => n.id != id).toList();
    _laterIds.remove(id);
    notifyListeners();
    return true;
  }

  List<AppNotification> _mockNotifications() {
    final now = DateTime.now();
    return <AppNotification>[
      AppNotification(
        id: 'n_1',
        title: '导师追问论文进度',
        content: '"初稿今天能发我看一下吗？"',
        timestamp: now.subtract(const Duration(minutes: 10)),
        source: 'Feishu',
        aiSuggestion: '建议今天 16:30 前发送，先整理摘要与目录。',
      ),
      AppNotification(
        id: 'n_2',
        title: '日程冲突提醒',
        content: '明天下午 "项目评审会" 与 "羽毛球" 时间冲突。',
        timestamp: now.subtract(const Duration(minutes: 34)),
        source: 'Calendar',
        aiSuggestion: '建议保留评审会，自动改约周末打球。',
      ),
      AppNotification(
        id: 'n_3',
        title: '会议纪要已生成',
        content: '产品评审会已提取 3 条可执行项。',
        timestamp: now.subtract(const Duration(hours: 2)),
        source: 'Meeting',
        aiSuggestion: '可一键转为待办并分配截止时间。',
      ),
      AppNotification(
        id: 'n_4',
        title: '客户消息待回复',
        content: '客户询问报价是否可在周五前确认。',
        timestamp: now.subtract(const Duration(hours: 4)),
        source: 'Email',
        aiSuggestion: '建议先发确认邮件，再补正式报价单。',
      ),
    ];
  }

  @override
  void dispose() {
    stopPolling();
    _apiBaseUrlSub?.cancel();
    super.dispose();
  }
}
