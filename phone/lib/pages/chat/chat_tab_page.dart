import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';

import 'package:freeu/providers/home_provider.dart';
import 'package:freeu/providers/mobile_data_provider.dart';
import 'package:freeu/ui/mobile/mobile_tokens.dart';
import 'package:freeu/widgets/mobile_bottom_sheet.dart';
import 'package:freeu/widgets/mobile_page_header.dart';

class ChatTabPage extends StatefulWidget {
  const ChatTabPage({super.key});

  @override
  State<ChatTabPage> createState() => _ChatTabPageState();
}

class _ChatTabPageState extends State<ChatTabPage> with AutomaticKeepAliveClientMixin {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<MobileDataProvider>().refreshMessages();
    });
  }

  @override
  bool get wantKeepAlive => true;

  final ScrollController _scrollController = ScrollController();
  final TextEditingController _textController = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _scrollController.dispose();
    _textController.dispose();
    super.dispose();
  }

  void scrollToTop() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _send() async {
    if (_sending) return;
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    _textController.clear();
    setState(() => _sending = true);
    await context.read<MobileDataProvider>().sendChatMessage(text);
    if (mounted) {
      setState(() => _sending = false);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Consumer<MobileDataProvider>(
      builder: (context, data, child) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
          }
        });

        final keyboardVisible = MediaQuery.of(context).viewInsets.bottom > 0;
        if (keyboardVisible) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_scrollController.hasClients) {
              _scrollController.animateTo(
                _scrollController.position.maxScrollExtent,
                duration: const Duration(milliseconds: 150),
                curve: Curves.easeOut,
              );
            }
          });
        }

        return Container(
          decoration: const BoxDecoration(gradient: MobileTokens.appBackground),
          child: Column(
            children: [
              const MobilePageHeader(
                title: '对话',
                subtitle: '快捷提问、截图分析、语音输入',
                padding: EdgeInsets.fromLTRB(20, 12, 20, 8),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _quickChip('总结今天消息'),
                      const SizedBox(width: 8),
                      _quickChip('提取待办'),
                      const SizedBox(width: 8),
                      _quickChip('安排会议'),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  itemCount: data.messages.length,
                  itemBuilder: (context, index) {
                    final m = data.messages[index];
                    return TweenAnimationBuilder<double>(
                      key: ValueKey('chat_${m.id}'),
                      duration: Duration(milliseconds: 180 + (index * 24).clamp(0, 220)),
                      curve: Curves.easeOutCubic,
                      tween: Tween<double>(begin: 0, end: 1),
                      builder: (context, value, child) {
                        return Opacity(
                          opacity: value,
                          child: Transform.translate(
                            offset: Offset(0, 12 * (1 - value)),
                            child: child,
                          ),
                        );
                      },
                      child: _bubble(m),
                    );
                  },
                ),
              ),
              _composer(),
            ],
          ),
        );
      },
    );
  }

  Widget _bubble(MobileChatMessage message) {
    final align = message.isUser ? Alignment.centerRight : Alignment.centerLeft;
    final bg = message.isUser ? const Color(0xFF285EA8) : MobileTokens.surface;
    final radius = message.isUser
        ? const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
            bottomRight: Radius.circular(4),
          )
        : const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(4),
            bottomRight: Radius.circular(16),
          );

    return Align(
      alignment: align,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: const BoxConstraints(maxWidth: 320),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: radius,
          border: Border.all(color: message.isUser ? const Color(0x3347B3FF) : MobileTokens.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message.text,
              style: const TextStyle(color: MobileTokens.textPrimary, fontSize: 14.5, height: 1.35),
            ),
            if (message.hasAction) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () {
                  _showBatchAddTasksSheet(message.extractedTasks);
                },
                icon: const Icon(Icons.playlist_add, size: 15),
                label: const Text('一键添加为待办'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: MobileTokens.accent,
                  side: const BorderSide(color: MobileTokens.accentSoft),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                ),
              ),
            ],
            if (message.extractedTasks.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0x201E3D64),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: MobileTokens.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '识别结果',
                      style: TextStyle(
                        color: MobileTokens.accent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    ...message.extractedTasks.map(
                      (task) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          '• $task',
                          style: const TextStyle(color: MobileTokens.textPrimary, fontSize: 13.5),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _composer() {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(12, 6, 12, bottomInset > 0 ? bottomInset + 6 : 10),
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
          decoration: BoxDecoration(
            color: MobileTokens.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: MobileTokens.border),
          ),
          child: Row(
            children: [
              IconButton(
                onPressed: _showInputActions,
                icon: const Icon(FontAwesomeIcons.plus, size: 16, color: MobileTokens.textSecondary),
              ),
              Expanded(
                child: TextField(
                  controller: _textController,
                  style: const TextStyle(color: MobileTokens.textPrimary),
                  decoration: const InputDecoration(
                    hintText: '输入消息...',
                    hintStyle: TextStyle(color: MobileTokens.textSecondary),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                  minLines: 1,
                  maxLines: 4,
                  onSubmitted: (_) => _send(),
                ),
              ),
              _sending
                  ? const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 10),
                      child: SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: MobileTokens.accent),
                      ),
                    )
                  : IconButton(
                      onPressed: _send,
                      icon: const Icon(FontAwesomeIcons.arrowUp, size: 16, color: MobileTokens.accent),
                    ),
            ],
          ),
        ),
      ),
    );
  }

  void _showInputActions() {
    showMobileBottomSheet<void>(
      context: context,
      builder: (ctx) {
        return MobileBottomSheet(
          padding: const EdgeInsets.all(10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _action('拍照提问', Icons.photo_camera_outlined, '模拟：已添加图片'),
              _action('相册/截图', Icons.image_outlined, '模拟：已选择截图'),
              _action('语音输入', Icons.keyboard_voice_outlined, '模拟：已开始语音录入'),
            ],
          ),
        );
      },
    );
  }

  Widget _action(String text, IconData icon, String toast) {
    return ListTile(
      leading: Icon(icon, color: MobileTokens.accent),
      title: Text(text, style: const TextStyle(color: MobileTokens.textPrimary)),
      onTap: () {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(toast)));
      },
    );
  }

  Widget _quickChip(String text) {
    return GestureDetector(
      onTap: () {
        _textController.text = text;
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: MobileTokens.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: MobileTokens.border),
        ),
        child: Text(
          text,
          style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 12.5, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  void _showBatchAddTasksSheet(List<String> tasks) {
    final effective = tasks.isEmpty ? <String>['根据对话提取的跟进行动'] : tasks;
    final List<bool> checked = List<bool>.filled(effective.length, true);

    showMobileBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx2, setModalState) {
            return MobileBottomSheet(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '转为待办',
                    style: TextStyle(
                      color: MobileTokens.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...List.generate(effective.length, (i) {
                    return CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      activeColor: MobileTokens.accent,
                      value: checked[i],
                      title: Text(
                        effective[i],
                        style: const TextStyle(color: MobileTokens.textPrimary, fontSize: 14),
                      ),
                      onChanged: (v) {
                        setModalState(() => checked[i] = v ?? false);
                      },
                    );
                  }),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx2),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: MobileTokens.border),
                          ),
                          child: const Text('取消', style: TextStyle(color: MobileTokens.textSecondary)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () {
                            final added = _addCheckedTasks(effective, checked);
                            Navigator.pop(ctx2);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('已添加 $added 条待办')),
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: MobileTokens.accent,
                            foregroundColor: const Color(0xFF0A162A),
                          ),
                          child: const Text('确认添加', style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () {
                            final added = _addCheckedTasks(effective, checked);
                            Navigator.pop(ctx2);
                            context.read<HomeProvider>().setIndex(1);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('已添加 $added 条待办，已跳转')),
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2F9EFF),
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('添加并查看', style: TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  int _addCheckedTasks(List<String> effective, List<bool> checked) {
    final provider = context.read<MobileDataProvider>();
    int added = 0;
    for (int i = 0; i < effective.length; i++) {
      if (checked[i]) {
        provider.addTaskFromText(effective[i], source: '对话提取');
        added++;
      }
    }
    return added;
  }
}
