import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import 'package:freeu/backend/http/api/notifications.dart';
import 'package:freeu/providers/action_items_provider.dart';
import 'package:freeu/providers/home_provider.dart';
import 'package:freeu/providers/notification_center_provider.dart';
import 'package:freeu/ui/mobile/mobile_tokens.dart';
import 'package:freeu/widgets/mobile_bottom_sheet.dart';
import 'package:freeu/widgets/mobile_page_header.dart';

class MessagesPage extends StatefulWidget {
  const MessagesPage({super.key});

  @override
  State<MessagesPage> createState() => _MessagesPageState();
}

class _MessagesPageState extends State<MessagesPage>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final ScrollController _scrollController = ScrollController();
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<NotificationCenterProvider>().refresh(force: true);
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void scrollToTop() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  List<AppNotification> _getFilteredNotifications(
    List<AppNotification> notifications,
  ) {
    final now = DateTime.now();
    switch (_filter) {
      case 'today':
        final start = DateTime(now.year, now.month, now.day);
        return notifications.where((n) => n.timestamp.isAfter(start)).toList();
      case 'week':
        final start = now.subtract(Duration(days: now.weekday - 1));
        return notifications.where((n) => n.timestamp.isAfter(start)).toList();
      default:
        return notifications;
    }
  }

  String _relativeTime(DateTime ts) {
    final diff = DateTime.now().difference(ts);
    if (diff.inMinutes < 1) return '刚刚';
    if (diff.inMinutes < 60) return '${diff.inMinutes} 分钟前';
    if (diff.inHours < 24) return '${diff.inHours} 小时前';
    if (diff.inDays < 7) return '${diff.inDays} 天前';
    return '${ts.month}/${ts.day}';
  }

  IconData _sourceIcon(String? source) {
    switch ((source ?? '').toLowerCase()) {
      case 'feishu':
        return FontAwesomeIcons.message;
      case 'wechat':
        return FontAwesomeIcons.weixin;
      case 'email':
        return FontAwesomeIcons.envelope;
      case 'calendar':
        return FontAwesomeIcons.calendarDays;
      case 'meeting':
        return FontAwesomeIcons.users;
      case 'todo':
        return FontAwesomeIcons.listCheck;
      default:
        return FontAwesomeIcons.bell;
    }
  }

  Future<void> _acceptNotification(AppNotification n) async {
    final ok = await context.read<NotificationCenterProvider>().acceptOrIgnore(
      n.id,
    );
    if (!mounted) return;
    if (ok) {
      await context.read<NotificationCenterProvider>().refresh(force: true);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('已采纳建议')));
    }
  }

  Future<void> _ignoreNotification(AppNotification n) async {
    final ok = await context.read<NotificationCenterProvider>().acceptOrIgnore(
      n.id,
    );
    if (!mounted) return;
    if (ok) {
      await context.read<NotificationCenterProvider>().refresh(force: true);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('已忽略该消息')));
    }
  }

  void _markLater(AppNotification n) {
    context.read<NotificationCenterProvider>().markLater(n.id);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('已加入稍后处理')));
  }

  Future<void> _convertToTaskAndJump(AppNotification n) async {
    final created = await context.read<ActionItemsProvider>().createActionItem(
      description: n.title,
      dueAt: DateTime.now().add(const Duration(hours: 8)),
      completed: false,
    );
    if (!mounted) return;
    if (created == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('转待办失败，请检查中心节点连接')));
      return;
    }
    await context.read<NotificationCenterProvider>().refresh(force: true);
    await context.read<ActionItemsProvider>().forceRefreshActionItems();
    context.read<HomeProvider>().setIndex(1);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('已转为待办，已跳转')));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Consumer<NotificationCenterProvider>(
      builder: (context, center, child) {
        final list = _getFilteredNotifications(center.notifications);
        final drafts = center.draftTodos;
        final totalCount = list.length + drafts.length;
        final hasAnyContent = totalCount > 0;

        return Container(
          decoration: const BoxDecoration(gradient: MobileTokens.appBackground),
          child: Column(
            children: [
              MobilePageHeader(
                title: '消息',
                subtitle: 'AI 主动提醒流，支持快速处理与转待办',
                trailing: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: MobileTokens.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: MobileTokens.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '$totalCount 条',
                        style: const TextStyle(
                          color: MobileTokens.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        _syncText(center),
                        style: const TextStyle(
                          color: MobileTokens.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    _buildFilter('all', '全部'),
                    const SizedBox(width: 8),
                    _buildFilter('today', '今天'),
                    const SizedBox(width: 8),
                    _buildFilter('week', '本周'),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child:
                    center.loading && !hasAnyContent
                        ? const Center(
                          child: CircularProgressIndicator(
                            color: MobileTokens.accent,
                          ),
                        )
                        : !hasAnyContent
                        ? _buildEmptyState()
                        : RefreshIndicator(
                          color: MobileTokens.accent,
                          onRefresh: () async {
                            await Future.wait([
                              center.refresh(force: true),
                              center.pollDraftTodos(force: true),
                            ]);
                          },
                          child: ListView.builder(
                            controller: _scrollController,
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                            itemCount: drafts.length + list.length,
                            itemBuilder: (context, index) {
                              if (index < drafts.length) {
                                return _buildDraftTodoCard(
                                  drafts[index],
                                  index,
                                );
                              }
                              final nIdx = index - drafts.length;
                              final n = list[nIdx];
                              final isLater = center.laterIds.contains(n.id);
                              return TweenAnimationBuilder<double>(
                                key: ValueKey('msg_${n.id}'),
                                duration: Duration(
                                  milliseconds:
                                      200 + (index * 40).clamp(0, 240),
                                ),
                                curve: Curves.easeOutCubic,
                                tween: Tween<double>(begin: 0, end: 1),
                                builder: (context, value, child) {
                                  return Opacity(
                                    opacity: value,
                                    child: Transform.translate(
                                      offset: Offset(0, 14 * (1 - value)),
                                      child: child,
                                    ),
                                  );
                                },
                                child: Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: _buildCard(n, isLater),
                                ),
                              );
                            },
                          ),
                        ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDraftTodoCard(DraftTodo draft, int index) {
    return TweenAnimationBuilder<double>(
      key: ValueKey('draft_${draft.id}'),
      duration: Duration(milliseconds: 200 + (index * 40).clamp(0, 240)),
      curve: Curves.easeOutCubic,
      tween: Tween<double>(begin: 0, end: 1),
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 14 * (1 - value)),
            child: child,
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Container(
          decoration: MobileTokens.cardDecoration(highlight: true),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: const Color(0xFF1A3A5C),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Center(
                      child: FaIcon(
                        FontAwesomeIcons.listCheck,
                        size: 13,
                        color: MobileTokens.accent,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'AI 识别待办 · 待确认',
                      style: TextStyle(
                        color: MobileTokens.accent,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    _relativeTime(draft.createdAt),
                    style: const TextStyle(
                      color: MobileTokens.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                draft.name,
                style: const TextStyle(
                  color: MobileTokens.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (draft.description != null &&
                  draft.description!.trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  draft.description!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: MobileTokens.textSecondary,
                    fontSize: 14,
                    height: 1.35,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _actionButton(
                      label: '确认添加',
                      primary: true,
                      onTap: () async {
                        final ok = await context
                            .read<NotificationCenterProvider>()
                            .acceptDraft(draft.id);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(ok ? '已确认为待办' : '操作失败')),
                          );
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _actionButton(
                      label: '忽略',
                      primary: false,
                      onTap: () async {
                        final ok = await context
                            .read<NotificationCenterProvider>()
                            .dismissDraft(draft.id);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(ok ? '已忽略' : '操作失败')),
                          );
                        }
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilter(String value, String text) {
    final active = _filter == value;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? MobileTokens.accentSoft : MobileTokens.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? MobileTokens.accentSoft : MobileTokens.border,
          ),
        ),
        child: Text(
          text,
          style: TextStyle(
            color:
                active ? MobileTokens.textPrimary : MobileTokens.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildCard(AppNotification n, bool isLater) {
    final isRecent = DateTime.now().difference(n.timestamp).inMinutes <= 30;

    return Container(
      decoration: MobileTokens.cardDecoration(highlight: isRecent && !isLater),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: MobileTokens.surfaceElevated,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: FaIcon(
                    _sourceIcon(n.source),
                    size: 13,
                    color: MobileTokens.textSecondary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  n.source?.isNotEmpty == true ? n.source! : '系统消息',
                  style: const TextStyle(
                    color: MobileTokens.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ),
              Text(
                _relativeTime(n.timestamp),
                style: const TextStyle(
                  color: MobileTokens.textSecondary,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            n.title,
            style: const TextStyle(
              color: MobileTokens.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            n.content,
            style: const TextStyle(
              color: MobileTokens.textSecondary,
              fontSize: 14,
              height: 1.35,
            ),
          ),
          if (n.aiSuggestion != null && n.aiSuggestion!.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: MobileTokens.surfaceElevated,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: MobileTokens.border),
              ),
              child: Text(
                'AI 建议：${n.aiSuggestion}',
                style: const TextStyle(
                  color: MobileTokens.textPrimary,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _actionButton(
                  label: '采纳',
                  primary: true,
                  onTap: () {
                    _acceptNotification(n);
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _actionButton(
                  label: isLater ? '已稍后' : '稍后',
                  primary: false,
                  onTap: () {
                    _markLater(n);
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _actionButton(
                  label: '详情',
                  primary: false,
                  onTap: () {
                    _showDetails(n);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actionButton({
    required String label,
    required bool primary,
    required VoidCallback onTap,
  }) {
    return SizedBox(
      height: 34,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor:
              primary ? MobileTokens.accent : MobileTokens.surfaceElevated,
          foregroundColor: Colors.white,
          side: const BorderSide(color: MobileTokens.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: MobileTokens.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: MobileTokens.border),
              ),
              child: const Center(
                child: FaIcon(
                  FontAwesomeIcons.inbox,
                  size: 28,
                  color: MobileTokens.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '暂无需要处理的消息',
              style: TextStyle(
                color: MobileTokens.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '当 AI 检测到重要事件时，会第一时间推送到这里。',
              textAlign: TextAlign.center,
              style: TextStyle(color: MobileTokens.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  void _showDetails(AppNotification n) {
    showMobileBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return MobileBottomSheet(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
          radius: 20,
          backgroundColor: const Color(0xFF12182A),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                n.title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: MobileTokens.surfaceElevated,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: MobileTokens.border),
                    ),
                    child: Text(
                      n.source ?? '系统消息',
                      style: const TextStyle(
                        color: MobileTokens.accent,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _relativeTime(n.timestamp),
                    style: const TextStyle(
                      color: MobileTokens.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _detailBlock(
                title: '事件摘要',
                child: Text(
                  n.content,
                  style: const TextStyle(
                    color: MobileTokens.textPrimary,
                    fontSize: 15,
                    height: 1.45,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _detailBlock(
                title: '上下文时间线',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _timelineLine('10:20', '收到触发消息'),
                    _timelineLine('10:22', 'AI 识别风险与优先级'),
                    _timelineLine('10:24', '生成建议动作'),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              _detailBlock(
                title: 'AI 建议',
                child: Text(
                  n.aiSuggestion?.isNotEmpty == true
                      ? n.aiSuggestion!
                      : '建议先确认细节，再安排可执行动作。',
                  style: const TextStyle(
                    color: MobileTokens.textPrimary,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _actionButton(
                      label: '转待办',
                      primary: false,
                      onTap: () {
                        Navigator.of(ctx).pop();
                        _convertToTaskAndJump(n);
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _actionButton(
                      label: '忽略',
                      primary: false,
                      onTap: () {
                        Navigator.of(ctx).pop();
                        _ignoreNotification(n);
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _actionButton(
                      label: '采纳',
                      primary: true,
                      onTap: () {
                        Navigator.of(ctx).pop();
                        _acceptNotification(n);
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _detailBlock({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: MobileTokens.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MobileTokens.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: MobileTokens.accent,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _timelineLine(String time, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 48,
            child: Text(
              time,
              style: const TextStyle(
                color: MobileTokens.textSecondary,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Container(
            width: 6,
            height: 6,
            margin: const EdgeInsets.only(top: 5),
            decoration: const BoxDecoration(
              color: MobileTokens.accent,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: MobileTokens.textPrimary,
                fontSize: 13.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _syncText(NotificationCenterProvider center) {
    if (center.loading) return '同步中...';
    final ts = center.lastLoadedAt;
    if (ts == null) return '等待同步';
    final diff = DateTime.now().difference(ts);
    if (diff.inSeconds < 10) return '刚同步';
    if (diff.inMinutes < 1) return '${diff.inSeconds}s 前';
    return '${diff.inMinutes}m 前';
  }
}
