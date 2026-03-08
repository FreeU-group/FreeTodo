import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import 'package:freeu/providers/mobile_data_provider.dart';
import 'package:freeu/ui/mobile/mobile_tokens.dart';
import 'package:freeu/widgets/mobile_bottom_sheet.dart';
import 'package:freeu/widgets/mobile_page_header.dart';

class TasksPage extends StatefulWidget {
  const TasksPage({super.key});

  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> with AutomaticKeepAliveClientMixin {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<MobileDataProvider>().refreshTasks();
    });
  }

  @override
  bool get wantKeepAlive => true;

  final ScrollController _scrollController = ScrollController();
  String _scope = 'today';

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void scrollToTop() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(0, duration: const Duration(milliseconds: 260), curve: Curves.easeOut);
    }
  }

  List<MobileTask> _scopedTasks(MobileDataProvider provider) {
    switch (_scope) {
      case 'today':
        return provider.todayTasks;
      case 'week':
        return provider.weekTasks;
      default:
        return provider.tasks;
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Consumer<MobileDataProvider>(
      builder: (context, data, child) {
        final scoped = _scopedTasks(data);
        final high = scoped
            .where((t) => t.priority == MobileTaskPriority.high && t.status != MobileTaskStatus.done)
            .toList();
        final normal = scoped
            .where((t) => t.priority == MobileTaskPriority.normal && t.status != MobileTaskStatus.done)
            .toList();
        final done = scoped.where((t) => t.status == MobileTaskStatus.done).toList();

        return Container(
          decoration: const BoxDecoration(gradient: MobileTokens.appBackground),
          child: Stack(
            children: [
              RefreshIndicator(
                color: MobileTokens.accent,
                onRefresh: () => context.read<MobileMockProvider>().refreshTasks(),
                child: ListView(
                  controller: _scrollController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    MobilePageHeader(
                      title: '待办',
                      subtitle: _syncText(mock),
                      padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                    ),
                  Row(
                    children: [
                      _scopeChip('today', '今日'),
                      const SizedBox(width: 6),
                      _scopeChip('week', '本周'),
                      const SizedBox(width: 6),
                      _scopeChip('all', '全部'),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _summaryCard(
                          title: '进行中',
                          value: '${data.tasks.where((t) => t.status == MobileTaskStatus.doing).length}',
                          icon: FontAwesomeIcons.bolt,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _summaryCard(
                          title: '待处理',
                          value: '${data.tasks.where((t) => t.status == MobileTaskStatus.todo).length}',
                          icon: FontAwesomeIcons.clock,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _summaryCard(
                          title: '已完成',
                          value: '${data.tasks.where((t) => t.status == MobileTaskStatus.done).length}',
                          icon: FontAwesomeIcons.circleCheck,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    child: _scope == 'all'
                        ? Column(
                            key: const ValueKey<String>('scope_all'),
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionTitle('全部任务（可拖拽排序，左右滑动操作）'),
                              _reorderableAllList(data),
                            ],
                          )
                        : Column(
                            key: ValueKey<String>('scope_$_scope'),
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _sectionTitle('高优先级'),
                              ...high.map(_taskTile),
                              if (high.isEmpty) _emptyLine('暂无高优先级任务'),
                              const SizedBox(height: 14),
                              _sectionTitle('普通'),
                              ...normal.map(_taskTile),
                              if (normal.isEmpty) _emptyLine('暂无普通任务'),
                              const SizedBox(height: 14),
                              _sectionTitle('已完成'),
                              ...done.map(_taskTile),
                              if (done.isEmpty) _emptyLine('暂无已完成任务'),
                            ],
                          ),
                  ),
                  ],
                ),
              ),
              Positioned(
                right: 18,
                bottom: 96,
                child: FloatingActionButton(
                  backgroundColor: MobileTokens.accent,
                  onPressed: _showAddTaskSheet,
                  child: const Icon(Icons.add, color: Color(0xFF0A162A)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _scopeChip(String value, String label) {
    final active = _scope == value;
    return GestureDetector(
      onTap: () => setState(() => _scope = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: active ? MobileTokens.accentSoft : MobileTokens.surface,
          border: Border.all(color: active ? MobileTokens.accent : MobileTokens.border),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? MobileTokens.textPrimary : MobileTokens.textSecondary,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 0, 6),
      child: Text(
        title,
        style: const TextStyle(
          color: MobileTokens.textSecondary,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _summaryCard({required String title, required String value, required IconData icon}) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: MobileTokens.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MobileTokens.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 13, color: MobileTokens.textSecondary),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(color: MobileTokens.textPrimary, fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Text(title, style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 11.5)),
        ],
      ),
    );
  }

  Widget _emptyLine(String text) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: MobileTokens.cardDecoration(),
      child: Text(text, style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 13)),
    );
  }

  Widget _taskTile(MobileTask task) {
    final provider = context.read<MobileDataProvider>();
    final isDone = task.status == MobileTaskStatus.done;
    final isIgnored = task.status == MobileTaskStatus.ignored;
    final accent = isDone
        ? MobileTokens.success
        : isIgnored
            ? MobileTokens.warning
            : (task.priority == MobileTaskPriority.high ? MobileTokens.warning : MobileTokens.accent);

    return Dismissible(
      key: ValueKey('task_${task.id}'),
      background: _swipeBg(
        alignment: Alignment.centerLeft,
        color: MobileTokens.success.withOpacity(0.18),
        icon: Icons.check_circle_outline,
        text: '完成',
      ),
      secondaryBackground: _swipeBg(
        alignment: Alignment.centerRight,
        color: MobileTokens.warning.withOpacity(0.16),
        icon: Icons.do_not_disturb_on_outlined,
        text: '忽略',
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          provider.cycleTaskStatus(task);
        } else if (direction == DismissDirection.endToStart) {
          provider.ignoreTask(task);
        }
        return false;
      },
      child: GestureDetector(
        onTap: () => _showEditTaskSheet(task),
        onLongPress: () => _showTaskActions(task),
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: MobileTokens.cardDecoration(highlight: !isDone && task.priority == MobileTaskPriority.high),
          child: Row(
            children: [
              GestureDetector(
                onTap: () => provider.cycleTaskStatus(task),
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: accent.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: accent),
                  ),
                  child: Icon(
                    isDone ? Icons.check : Icons.circle_outlined,
                    size: isDone ? 14 : 12,
                    color: accent,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.title,
                      style: TextStyle(
                        color: isIgnored ? MobileTokens.textSecondary : MobileTokens.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        decoration: isDone ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(task.source, style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 12.5)),
                    const SizedBox(height: 3),
                    Text(
                      '截止 ${task.dueAt.month}/${task.dueAt.day} ${task.dueAt.hour.toString().padLeft(2, '0')}:${task.dueAt.minute.toString().padLeft(2, '0')}',
                      style: TextStyle(color: accent.withOpacity(0.92), fontSize: 12),
                    ),
                  ],
                ),
              ),
              const Icon(FontAwesomeIcons.chevronRight, size: 12, color: MobileTokens.textSecondary),
            ],
          ),
        ),
      ),
    );
  }

  Widget _swipeBg({
    required Alignment alignment,
    required Color color,
    required IconData icon,
    required String text,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: alignment,
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: MobileTokens.textPrimary),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(color: MobileTokens.textPrimary, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _reorderableAllList(MobileDataProvider data) {
    final all = List<MobileTask>.from(data.tasks);
    if (all.isEmpty) return _emptyLine('暂无任务');

    return ReorderableListView.builder(
      key: const PageStorageKey<String>('task_reorder_all'),
      shrinkWrap: true,
      buildDefaultDragHandles: false,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: all.length,
      onReorder: (oldIndex, newIndex) {
        if (newIndex > oldIndex) newIndex -= 1;
        final updated = List<MobileTask>.from(all);
        final item = updated.removeAt(oldIndex);
        updated.insert(newIndex, item);
        data.reorderTasksByIds(updated.map((e) => e.id).toList());
      },
      itemBuilder: (context, index) {
        final task = all[index];
        return ReorderableDelayedDragStartListener(
          key: ValueKey('reorder_${task.id}'),
          index: index,
          child: Stack(
            children: [
              _taskTile(task),
              Positioned(
                right: 8,
                top: 16,
                child: Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: MobileTokens.surfaceElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: MobileTokens.border),
                  ),
                  child: const Icon(Icons.drag_indicator, size: 16, color: MobileTokens.textSecondary),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showTaskActions(MobileTask task) {
    showMobileBottomSheet<void>(
      context: context,
      builder: (ctx) {
        final provider = context.read<MobileDataProvider>();
        return MobileBottomSheet(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _actionLine(Icons.play_arrow_rounded, '切换状态', () {
                Navigator.pop(ctx);
                provider.cycleTaskStatus(task);
              }),
              _actionLine(Icons.do_not_disturb_on_outlined, '忽略这条', () {
                Navigator.pop(ctx);
                provider.ignoreTask(task);
              }),
              _actionLine(Icons.edit_outlined, '编辑', () {
                Navigator.pop(ctx);
                _showEditTaskSheet(task);
              }),
            ],
          ),
        );
      },
    );
  }

  Widget _actionLine(IconData icon, String text, VoidCallback onTap) {
    return ListTile(
      dense: true,
      visualDensity: const VisualDensity(vertical: -1),
      leading: Icon(icon, color: MobileTokens.accent),
      title: Text(text, style: const TextStyle(color: MobileTokens.textPrimary)),
      onTap: onTap,
    );
  }

  void _showAddTaskSheet() {
    final controller = TextEditingController();
    final templates = <String>[
      '给导师发论文初稿',
      '整理会议纪要并同步团队',
      '确认下周出差安排',
      '跟进客户报价邮件',
    ];
    MobileTaskPriority priority = MobileTaskPriority.normal;
    String source = '手动添加';
    DateTime dueAt = DateTime.now().add(const Duration(days: 1));
    showMobileBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx2, setModalState) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx2).viewInsets.bottom),
              child: _taskEditorShell(
                title: '新增待办',
                submitLabel: '添加待办',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: controller,
                      autofocus: true,
                      style: const TextStyle(color: MobileTokens.textPrimary),
                      decoration: _fieldDecoration('输入任务内容，例如：明早给王总回电话'),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: templates.map((t) {
                        return InkWell(
                          onTap: () {
                            controller.text = t;
                            controller.selection = TextSelection.fromPosition(
                              TextPosition(offset: controller.text.length),
                            );
                            setModalState(() {});
                          },
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                            decoration: BoxDecoration(
                              color: MobileTokens.surfaceElevated,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: MobileTokens.border),
                            ),
                            child: Text(
                              t,
                              style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 12),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _pickTile(
                            icon: Icons.flag_outlined,
                            label: priority == MobileTaskPriority.high ? '高优先级' : '普通优先级',
                            onTap: () {
                              setModalState(() {
                                priority = priority == MobileTaskPriority.high
                                    ? MobileTaskPriority.normal
                                    : MobileTaskPriority.high;
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _pickTile(
                            icon: Icons.schedule,
                            label:
                                '${dueAt.month}/${dueAt.day} ${dueAt.hour.toString().padLeft(2, '0')}:${dueAt.minute.toString().padLeft(2, '0')}',
                            onTap: () async {
                              final picked = await showDatePicker(
                                context: ctx2,
                                initialDate: dueAt,
                                firstDate: DateTime.now().subtract(const Duration(days: 1)),
                                lastDate: DateTime.now().add(const Duration(days: 365)),
                              );
                              if (picked != null) {
                                setModalState(() {
                                  dueAt = DateTime(
                                    picked.year,
                                    picked.month,
                                    picked.day,
                                    dueAt.hour,
                                    dueAt.minute,
                                  );
                                });
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _smallOption(
                          active: source == '手动添加',
                          label: '手动',
                          onTap: () => setModalState(() => source = '手动添加'),
                        ),
                        _smallOption(
                          active: source == '消息转待办',
                          label: '来自消息',
                          onTap: () => setModalState(() => source = '消息转待办'),
                        ),
                        _smallOption(
                          active: source == '对话提取',
                          label: '来自对话',
                          onTap: () => setModalState(() => source = '对话提取'),
                        ),
                        _smallOption(
                          active: source == '语音录入',
                          label: '语音录入',
                          onTap: () => setModalState(() => source = '语音录入'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('模拟语音录入：请直接输入任务文本')),
                              );
                            },
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: MobileTokens.border),
                            ),
                            icon: const Icon(Icons.mic_none, size: 16),
                            label: const Text('语音'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              setModalState(() {
                                dueAt = DateTime.now().add(const Duration(hours: 2));
                              });
                            },
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: MobileTokens.border),
                            ),
                            icon: const Icon(Icons.flash_on_outlined, size: 16),
                            label: const Text('2小时后'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                onSubmit: () {
                  if (controller.text.trim().isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('请先输入待办内容')),
                    );
                    return;
                  }
                  context.read<MobileDataProvider>().addTask(
                        title: controller.text,
                        source: source,
                        priority: priority,
                        dueAt: dueAt,
                      );
                  Navigator.pop(ctx2);
                },
              ),
            );
          },
        );
      },
    );
  }

  void _showEditTaskSheet(MobileTask task) {
    final controller = TextEditingController(text: task.title);
    MobileTaskPriority priority = task.priority;
    DateTime due = task.dueAt;

    showMobileBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx2, setModalState) {
            return Padding(
              padding: EdgeInsets.only(bottom: MediaQuery.of(ctx2).viewInsets.bottom),
              child: _taskEditorShell(
                title: '编辑待办',
                child: Column(
                  children: [
                    TextField(
                      controller: controller,
                      style: const TextStyle(color: MobileTokens.textPrimary),
                      decoration: _fieldDecoration('任务标题'),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: _pickTile(
                            icon: Icons.flag_outlined,
                            label: priority == MobileTaskPriority.high ? '高优先级' : '普通优先级',
                            onTap: () {
                              setModalState(() {
                                priority = priority == MobileTaskPriority.high
                                    ? MobileTaskPriority.normal
                                    : MobileTaskPriority.high;
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _pickTile(
                            icon: Icons.schedule,
                            label:
                                '${due.month}/${due.day} ${due.hour.toString().padLeft(2, '0')}:${due.minute.toString().padLeft(2, '0')}',
                            onTap: () async {
                              final picked = await showDatePicker(
                                context: ctx2,
                                initialDate: due,
                                firstDate: DateTime.now().subtract(const Duration(days: 2)),
                                lastDate: DateTime.now().add(const Duration(days: 365)),
                              );
                              if (picked != null) {
                                setModalState(() {
                                  due = DateTime(picked.year, picked.month, picked.day, due.hour, due.minute);
                                });
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                onSubmit: () {
                  context.read<MobileDataProvider>().updateTask(
                        task,
                        title: controller.text,
                        dueAt: due,
                        priority: priority,
                      );
                  Navigator.pop(ctx2);
                },
              ),
            );
          },
        );
      },
    );
  }

  Widget _taskEditorShell({
    required String title,
    required Widget child,
    required VoidCallback onSubmit,
    String submitLabel = '保存',
  }) {
    return MobileBottomSheet(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: const EdgeInsets.all(14),
      radius: 18,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(color: MobileTokens.textPrimary, fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          child,
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onSubmit,
              style: ElevatedButton.styleFrom(
                elevation: 0,
                backgroundColor: MobileTokens.accent,
                foregroundColor: const Color(0xFF0A162A),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(submitLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _smallOption({
    required bool active,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: active ? MobileTokens.accentSoft : MobileTokens.surfaceElevated,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: active ? MobileTokens.accent : MobileTokens.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? MobileTokens.textPrimary : MobileTokens.textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _pickTile({required IconData icon, required String label, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: MobileTokens.surfaceElevated,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: MobileTokens.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: MobileTokens.accent),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: MobileTokens.textPrimary, fontSize: 12.5),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _syncText(MobileMockProvider mock) {
    if (mock.syncingTasks) return '同步中...';
    final ts = mock.lastTasksSyncAt;
    if (ts == null) return '等待同步';
    final diff = DateTime.now().difference(ts);
    if (diff.inSeconds < 10) return '刚同步';
    if (diff.inMinutes < 1) return '${diff.inSeconds}s 前同步';
    return '${diff.inMinutes}m 前同步';
  }

  InputDecoration _fieldDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: MobileTokens.textSecondary),
      filled: true,
      fillColor: MobileTokens.surfaceElevated,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: MobileTokens.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: MobileTokens.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: MobileTokens.accent),
      ),
    );
  }
}
