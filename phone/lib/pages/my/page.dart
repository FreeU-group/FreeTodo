import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:device_info_plus/device_info_plus.dart';

import 'package:freeu/backend/preferences.dart';
import 'package:freeu/backend/http/api/announcements.dart';
import 'package:freeu/core/app_shell.dart';
import 'package:freeu/env/lifetrace_env.dart';
import 'package:freeu/models/subscription.dart';
import 'package:freeu/pages/announcements/changelog_sheet.dart';
import 'package:freeu/pages/capture/connect.dart';
import 'package:freeu/pages/conversations/sync_page.dart';
import 'package:freeu/pages/persona/persona_provider.dart';
import 'package:freeu/pages/referral/referral_page.dart';
import 'package:freeu/pages/settings/data_privacy_page.dart';
import 'package:freeu/pages/settings/developer.dart';
import 'package:freeu/pages/settings/device_settings.dart';
import 'package:freeu/pages/settings/integrations_page.dart';
import 'package:freeu/pages/settings/notifications_settings_page.dart';
import 'package:freeu/pages/settings/profile.dart';
import 'package:freeu/pages/settings/server_settings_page.dart';
import 'package:freeu/pages/settings/usage_page.dart';
import 'package:freeu/providers/connectivity_provider.dart';
import 'package:freeu/providers/device_provider.dart';
import 'package:freeu/providers/perception_provider.dart';
import 'package:freeu/providers/usage_provider.dart';
import 'package:freeu/services/auth_service.dart';
import 'package:freeu/ui/mobile/mobile_tokens.dart';
import 'package:freeu/utils/analytics/mixpanel.dart';
import 'package:freeu/utils/l10n_extensions.dart';
import 'package:freeu/utils/other/temp.dart';
import 'package:freeu/utils/platform/platform_service.dart';
import 'package:freeu/widgets/dialog.dart';
import 'package:freeu/widgets/mobile_page_header.dart';

class MyPage extends StatefulWidget {
  const MyPage({super.key});

  @override
  State<MyPage> createState() => _MyPageState();
}

class _MyPageState extends State<MyPage> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final ScrollController _scrollController = ScrollController();
  String? _version;
  String? _buildVersion;
  String? _shortDeviceInfo;

  @override
  void initState() {
    super.initState();
    _loadAppInfo();
  }

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

  Future<void> _loadAppInfo() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      String deviceInfo;
      try {
        final plugin = DeviceInfoPlugin();
        if (Platform.isAndroid) {
          final info = await plugin.androidInfo;
          deviceInfo = '${info.brand} ${info.model} — Android ${info.version.release}';
        } else if (Platform.isIOS) {
          final info = await plugin.iosInfo;
          deviceInfo = '${info.name} — iOS ${info.systemVersion}';
        } else {
          deviceInfo = '';
        }
      } catch (_) {
        deviceInfo = '';
      }

      if (mounted) {
        setState(() {
          _version = packageInfo.version;
          _buildVersion = packageInfo.buildNumber;
          _shortDeviceInfo = deviceInfo;
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Container(
      decoration: const BoxDecoration(gradient: MobileTokens.appBackground),
      child: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          controller: _scrollController,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            const MobilePageHeader(
              title: '我的',
              subtitle: '设备管理、设置与隐私配置',
              padding: EdgeInsets.fromLTRB(4, 0, 4, 14),
            ),

            // ── 设备与连接 ──
            _sectionTitle('设备与连接'),
            _deviceCard(),
            const SizedBox(height: 16),

            // ── 感知与隐私 ──
            _sectionTitle('感知与隐私'),
            _perceptionCard(),
            const SizedBox(height: 16),

            // ── 账号与设置 ──
            _sectionTitle('账号与设置'),
            _accountCard(),
            const SizedBox(height: 16),

            // ── 扩展功能 ──
            _sectionTitle('扩展功能'),
            _extensionsCard(),
            const SizedBox(height: 16),

            // ── 支持 ──
            if (!LifeTraceEnv.enabled) ...[
              _sectionTitle('支持'),
              _supportCard(),
              const SizedBox(height: 16),
            ],

            // ── 退出 ──
            _signOutCard(),
            const SizedBox(height: 16),

            // ── 版本信息 ──
            _versionInfo(),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  // ────────────────────────── 设备与连接 ──────────────────────────

  Widget _deviceCard() {
    return Consumer2<ConnectivityProvider, DeviceProvider>(
      builder: (context, connectivityProvider, deviceProvider, child) {
        final connected = connectivityProvider.isConnected;
        final device = deviceProvider.connectedDevice;
        final battery = deviceProvider.batteryLevel;

        return _simpleCard([
          _statusTile(
            icon: FontAwesomeIcons.server,
            title: '核心节点',
            subtitle: connected ? '已连接 · 运行正常' : '离线 · 请检查网络与中心节点',
            statusColor: connected ? MobileTokens.success : MobileTokens.danger,
          ),
          _divider(),
          _statusTile(
            icon: FontAwesomeIcons.headphonesSimple,
            title: device?.name ?? '录音设备',
            subtitle: device == null
                ? '未连接设备'
                : battery >= 0
                    ? '已连接 · 电量 ${battery.toStringAsFixed(0)}%'
                    : '已连接',
            statusColor: device == null ? MobileTokens.textSecondary : MobileTokens.success,
          ),
          _divider(),
          _navTile(
            icon: FontAwesomeIcons.plus,
            title: '添加新设备',
            subtitle: '扫描并连接蓝牙设备',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ConnectDevicePage())),
          ),
          if (deviceProvider.isConnected) ...[
            _divider(),
            _navTile(
              icon: FontAwesomeIcons.bluetooth,
              title: context.l10n.deviceSettings,
              subtitle: '蓝牙设备参数与固件',
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DeviceSettings())),
            ),
          ],
          if (LifeTraceEnv.enabled) ...[
            _divider(),
            _navTile(
              icon: FontAwesomeIcons.server,
              title: '服务器设置',
              subtitle: 'TCP / HTTP 隧道地址配置',
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ServerSettingsPage())),
            ),
          ],
        ]);
      },
    );
  }

  // ────────────────────────── 感知与隐私 ──────────────────────────

  Widget _perceptionCard() {
    return Consumer<PerceptionProvider>(
      builder: (context, perceptionProvider, child) {
        return _simpleCard([
          _switchTile(
            icon: FontAwesomeIcons.locationDot,
            title: 'GPS 位置',
            subtitle: perceptionProvider.gpsEnabled && perceptionProvider.gpsStatus.isNotEmpty
                ? perceptionProvider.gpsStatus
                : null,
            value: perceptionProvider.gpsEnabled,
            onChanged: (value) => perceptionProvider.setGpsEnabled(value, context),
          ),
          _divider(),
          _switchTile(
            icon: FontAwesomeIcons.paste,
            title: '剪贴板监听',
            value: perceptionProvider.clipboardEnabled,
            onChanged: (value) => perceptionProvider.setClipboardEnabled(value),
          ),
          _divider(),
          _switchTile(
            icon: FontAwesomeIcons.bell,
            title: '通知栏监听',
            value: perceptionProvider.notificationListenerEnabled,
            onChanged: (value) => perceptionProvider.setNotificationListenerEnabled(value),
          ),
          _divider(),
          _navTile(
            icon: FontAwesomeIcons.shield,
            title: '数据与隐私',
            subtitle: '查看和管理本地记忆数据',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DataPrivacyPage())),
          ),
        ]);
      },
    );
  }

  // ────────────────────────── 账号与设置 ──────────────────────────

  Widget _accountCard() {
    return Consumer<UsageProvider>(
      builder: (context, usageProvider, child) {
        final isUnlimited = usageProvider.subscription?.subscription.plan == PlanType.unlimited;
        return _simpleCard([
          _navTile(
            icon: FontAwesomeIcons.user,
            title: context.l10n.profile,
            subtitle: '查看个人资料',
            onTap: () => routeToPage(context, const ProfilePage()),
          ),
          _divider(),
          _navTile(
            icon: FontAwesomeIcons.bell,
            title: context.l10n.notifications,
            subtitle: '消息分级、频率与提醒方式',
            onTap: () => routeToPage(context, const NotificationsSettingsPage()),
          ),
          _divider(),
          _navTile(
            icon: FontAwesomeIcons.chartLine,
            title: context.l10n.planAndUsage,
            subtitle: isUnlimited ? 'Pro' : '查看当前计划',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const UsagePage())),
          ),
          _divider(),
          _navTile(
            icon: FontAwesomeIcons.cloudArrowUp,
            title: context.l10n.offlineSync,
            subtitle: '同步本地数据到云端',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncPage())),
          ),
        ]);
      },
    );
  }

  // ────────────────────────── 扩展功能 ──────────────────────────

  Widget _extensionsCard() {
    return _simpleCard([
      _navTile(
        icon: FontAwesomeIcons.networkWired,
        title: context.l10n.integrations,
        subtitle: '第三方服务集成',
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const IntegrationsPage())),
        badge: 'Beta',
      ),
      _divider(),
      _navTile(
        icon: FontAwesomeIcons.code,
        title: context.l10n.developerSettings,
        subtitle: 'API、MCP、高级配置',
        onTap: () => routeToPage(context, const DeveloperSettingsPage()),
      ),
      _divider(),
      _navTile(
        icon: FontAwesomeIcons.star,
        title: context.l10n.whatsNew,
        subtitle: '查看最新更新日志',
        onTap: () {
          MixpanelManager().whatsNewOpened();
          ChangelogSheet.showWithLoading(context, () => getAppChangelogs(limit: 5));
        },
      ),
    ]);
  }

  // ────────────────────────── 支持 ──────────────────────────

  Widget _supportCard() {
    return _simpleCard([
      if (PlatformService.isIntercomSupported) ...[
        _navTile(
          icon: FontAwesomeIcons.envelope,
          title: context.l10n.feedbackBug,
          subtitle: '报告问题或提出建议',
          onTap: () async {
            final url = Uri.parse('https://feedback.omi.me/');
            if (await canLaunchUrl(url)) await launchUrl(url, mode: LaunchMode.inAppBrowserView);
          },
        ),
        _divider(),
        _navTile(
          icon: FontAwesomeIcons.book,
          title: context.l10n.helpCenter,
          subtitle: '常见问题与使用指南',
          onTap: () async {
            final url = Uri.parse('https://help.omi.me/en/');
            if (await canLaunchUrl(url)) {
              try {
                await launchUrl(url, mode: LaunchMode.inAppBrowserView);
              } catch (_) {
                await launchUrl(url, mode: LaunchMode.externalApplication);
              }
            }
          },
        ),
        _divider(),
      ],
      _navTile(
        icon: FontAwesomeIcons.gift,
        title: context.l10n.referralProgram,
        subtitle: '邀请好友获得奖励',
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ReferralPage())),
        badge: 'New',
      ),
      _divider(),
      _navTile(
        icon: FontAwesomeIcons.desktop,
        title: context.l10n.getOmiForMac,
        subtitle: '在桌面端使用',
        onTap: () async {
          final url = Uri.parse('https://apps.apple.com/us/app/omi-ai-scale-yourself/id6502156163');
          await launchUrl(url, mode: LaunchMode.externalApplication);
        },
      ),
    ]);
  }

  // ────────────────────────── 退出登录 ──────────────────────────

  Widget _signOutCard() {
    return _simpleCard([
      _navTile(
        icon: FontAwesomeIcons.rightFromBracket,
        title: context.l10n.signOut,
        subtitle: '',
        onTap: () async {
          final personaProvider = Provider.of<PersonaProvider>(context, listen: false);
          await showDialog(
            context: context,
            builder: (ctx) => getDialog(
              ctx,
              () => Navigator.of(ctx).pop(),
              () async {
                Navigator.of(ctx).pop();
                await SharedPreferencesUtil().clear();
                await AuthService.instance.signOut();
                personaProvider.setRouting(PersonaProfileRouting.no_device);
                if (context.mounted) routeToPage(context, const AppShell(), replace: true);
              },
              context.l10n.signOutQuestion,
              context.l10n.signOutConfirmation,
            ),
          );
        },
        tintColor: Colors.redAccent,
      ),
    ]);
  }

  // ────────────────────────── 版本信息 ──────────────────────────

  Widget _versionInfo() {
    if (_version == null) return const SizedBox.shrink();
    final display = _buildVersion != null ? '$_version ($_buildVersion)' : _version!;
    return GestureDetector(
      onTap: () async {
        final full = 'FreeU AI $display${_shortDeviceInfo != null && _shortDeviceInfo!.isNotEmpty ? ' — $_shortDeviceInfo' : ''}';
        await Clipboard.setData(ClipboardData(text: full));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('版本信息已复制'), duration: Duration(seconds: 1)),
          );
        }
      },
      child: Center(
        child: Text(
          display,
          style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 12),
        ),
      ),
    );
  }

  // ════════════════════════ Widget helpers ════════════════════════

  Widget _sectionTitle(String text) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 0, 6, 8),
      child: Text(
        text,
        style: const TextStyle(
          color: MobileTokens.textSecondary,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _simpleCard(List<Widget> children) {
    return Container(
      decoration: MobileTokens.cardDecoration(),
      child: Column(children: children),
    );
  }

  Widget _divider() {
    return const Divider(height: 1, thickness: 1, color: MobileTokens.border, indent: 48, endIndent: 12);
  }

  Widget _statusTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color statusColor,
  }) {
    return _baseTile(
      icon: icon,
      title: title,
      subtitle: subtitle,
      iconColor: statusColor,
      trailing: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
      ),
    );
  }

  Widget _switchTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return _baseTile(
      icon: icon,
      title: title,
      subtitle: subtitle,
      iconColor: value ? MobileTokens.accent : MobileTokens.textSecondary,
      trailing: Switch(
        value: value,
        onChanged: onChanged,
        activeColor: MobileTokens.accent,
        activeTrackColor: MobileTokens.accentSoft,
      ),
    );
  }

  Widget _navTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    String? badge,
    Color? tintColor,
  }) {
    final color = tintColor ?? MobileTokens.accent;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: _baseTile(
        icon: icon,
        title: title,
        subtitle: subtitle.isEmpty ? null : subtitle,
        iconColor: color,
        titleColor: tintColor,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (badge != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: (badge == 'New' ? Colors.green : Colors.orange).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  badge,
                  style: TextStyle(
                    color: badge == 'New' ? Colors.green : Colors.orange,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 6),
            ],
            const Icon(FontAwesomeIcons.chevronRight, size: 12, color: MobileTokens.textSecondary),
          ],
        ),
      ),
    );
  }

  Widget _baseTile({
    required IconData icon,
    required String title,
    required String? subtitle,
    required Color iconColor,
    required Widget trailing,
    Color? titleColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(child: FaIcon(icon, size: 13, color: iconColor)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: titleColor ?? MobileTokens.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: const TextStyle(color: MobileTokens.textSecondary, fontSize: 12.5),
                  ),
                ],
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}
