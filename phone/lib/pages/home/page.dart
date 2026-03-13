import 'dart:async';
import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:calendar_date_picker2/calendar_date_picker2.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';
import 'package:upgrader/upgrader.dart';

import 'package:freeu/backend/http/api/agents.dart';
import 'package:freeu/backend/http/api/conversations.dart';
import 'package:freeu/backend/http/api/users.dart';
import 'package:freeu/backend/preferences.dart';
import 'package:freeu/backend/schema/app.dart';
import 'package:freeu/backend/schema/bt_device/bt_device.dart';
import 'package:freeu/backend/schema/geolocation.dart';
import 'package:freeu/main.dart';
import 'package:freeu/pages/apps/app_detail/app_detail.dart';
import 'package:freeu/pages/apps/page.dart';
import 'package:freeu/pages/chat/chat_tab_page.dart';
import 'package:freeu/pages/conversation_capturing/page.dart';
import 'package:freeu/pages/conversation_detail/page.dart';
import 'package:freeu/pages/conversations/conversations_page.dart';
import 'package:freeu/pages/conversations/sync_page.dart';
import 'package:freeu/pages/conversations/widgets/merge_action_bar.dart';
import 'package:freeu/pages/memories/page.dart';
import 'package:freeu/pages/messages/page.dart';
import 'package:freeu/pages/my/page.dart';
import 'package:freeu/pages/tasks/tasks_page.dart';
import 'package:freeu/pages/settings/daily_summary_detail_page.dart';
import 'package:freeu/pages/settings/data_privacy_page.dart';
import 'package:freeu/pages/settings/settings_drawer.dart';
import 'package:freeu/pages/settings/task_integrations_page.dart';
import 'package:freeu/pages/settings/wrapped_2025_page.dart';
import 'package:freeu/providers/action_items_provider.dart';
import 'package:freeu/providers/app_provider.dart';
import 'package:freeu/providers/capture_provider.dart';
import 'package:freeu/providers/connectivity_provider.dart';
import 'package:freeu/providers/conversation_provider.dart';
import 'package:freeu/providers/device_provider.dart';
import 'package:freeu/providers/announcement_provider.dart';
import 'package:freeu/providers/home_provider.dart';
import 'package:freeu/providers/message_provider.dart';
import 'package:freeu/providers/mobile_data_provider.dart';
import 'package:freeu/providers/notification_center_provider.dart';
import 'package:freeu/providers/sync_provider.dart';
import 'package:freeu/services/announcement_service.dart';
import 'package:freeu/services/notifications.dart';
import 'package:freeu/services/notifications/daily_reflection_notification.dart';
import 'package:freeu/utils/analytics/mixpanel.dart';
import 'package:freeu/utils/audio/foreground.dart';
import 'package:freeu/utils/enums.dart';
import 'package:freeu/utils/l10n_extensions.dart';
import 'package:freeu/utils/logger.dart';
import 'package:freeu/utils/platform/platform_manager.dart';
import 'package:freeu/utils/platform/platform_service.dart';
import 'package:freeu/utils/responsive/responsive_helper.dart';
import 'package:freeu/ui/mobile/mobile_tokens.dart';
import 'package:freeu/widgets/calendar_date_picker_sheet.dart';
import 'package:freeu/widgets/freemium_switch_dialog.dart';
import 'package:freeu/widgets/upgrade_alert.dart';
import 'package:freeu/widgets/bottom_nav_bar.dart';
import 'package:freeu/widgets/top_status_bar.dart';
import 'widgets/battery_info_widget.dart';

class HomePageWrapper extends StatefulWidget {
  final String? navigateToRoute;
  final String? autoMessage;
  const HomePageWrapper({super.key, this.navigateToRoute, this.autoMessage});

  @override
  State<HomePageWrapper> createState() => _HomePageWrapperState();
}

class _HomePageWrapperState extends State<HomePageWrapper> {
  String? _navigateToRoute;
  String? _autoMessage;

  @override
  void initState() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (mounted) {
        context.read<DeviceProvider>().periodicConnect(
          'coming from HomePageWrapper',
          boundDeviceOnly: true,
        );
      }
      if (SharedPreferencesUtil().notificationsEnabled) {
        NotificationService.instance.register();
        NotificationService.instance.saveNotificationToken();

        // Schedule daily reflection notification if enabled
        if (SharedPreferencesUtil().dailyReflectionEnabled) {
          DailyReflectionNotification.scheduleDailyNotification(
            channelKey: 'channel',
          );
        }
      }
    });
    _navigateToRoute = widget.navigateToRoute;
    _autoMessage = widget.autoMessage;
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return HomePage(
      navigateToRoute: _navigateToRoute,
      autoMessage: _autoMessage,
    );
  }
}

class HomePage extends StatefulWidget {
  final String? navigateToRoute;
  final String? autoMessage;
  const HomePage({super.key, this.navigateToRoute, this.autoMessage});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with WidgetsBindingObserver, TickerProviderStateMixin {
  ForegroundUtil foregroundUtil = ForegroundUtil();
  List<Widget> screens = [
    Container(),
    const SizedBox(),
    const SizedBox(),
    const SizedBox(),
  ];

  final _upgrader = MyUpgrader(debugLogging: false, debugDisplayOnce: false);
  bool scriptsInProgress = false;
  StreamSubscription? _notificationStreamSubscription;

  final GlobalKey<State<MessagesPage>> _messagesPageKey =
      GlobalKey<State<MessagesPage>>();
  final GlobalKey<State<TasksPage>> _tasksPageKey =
      GlobalKey<State<TasksPage>>();
  final GlobalKey<State<ChatTabPage>> _chatPageKey =
      GlobalKey<State<ChatTabPage>>();
  final GlobalKey<State<MyPage>> _myPageKey = GlobalKey<State<MyPage>>();
  late final List<Widget> _pages;

  // Freemium switch handler for auto-switch dialogs
  final FreemiumSwitchHandler _freemiumHandler = FreemiumSwitchHandler();

  CaptureProvider? _captureProvider;
  final Map<int, DateTime> _tabLastRefreshAt = <int, DateTime>{};
  Timer? _tabAutoRefreshTimer;

  void _initiateApps() {
    context.read<AppProvider>().getApps();
    context.read<AppProvider>().getPopularApps();
  }

  void _scrollToTop(int pageIndex) {
    switch (pageIndex) {
      case 0:
        final messagesState = _messagesPageKey.currentState;
        if (messagesState != null) {
          (messagesState as dynamic).scrollToTop();
        }
        break;
      case 1:
        final tasksState = _tasksPageKey.currentState;
        if (tasksState != null) {
          (tasksState as dynamic).scrollToTop();
        }
        break;
      case 2:
        final chatState = _chatPageKey.currentState;
        if (chatState != null) {
          (chatState as dynamic).scrollToTop();
        }
        break;
      case 3:
        final myState = _myPageKey.currentState;
        if (myState != null) {
          (myState as dynamic).scrollToTop();
        }
        break;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    String event = '';
    if (state == AppLifecycleState.paused) {
      event = 'App is paused';
      // Stop keepalive when app goes to background
      if (mounted) {
        Provider.of<MessageProvider>(context, listen: false).stopVmKeepalive();
        context.read<NotificationCenterProvider>().stopPolling();
      }
    } else if (state == AppLifecycleState.resumed) {
      event = 'App is resumed';

      // Reload convos
      if (mounted) {
        Provider.of<ConversationProvider>(
          context,
          listen: false,
        ).refreshConversations();
        Provider.of<CaptureProvider>(
          context,
          listen: false,
        ).refreshInProgressConversations();
      }

      // Ensure agent VM is running and restart keepalive
      if (mounted && SharedPreferencesUtil().claudeAgentEnabled) {
        ensureAgentVm();
        Provider.of<MessageProvider>(context, listen: false).startVmKeepalive();
      }
      if (mounted) {
        context.read<NotificationCenterProvider>().startPolling();
        final selected =
            Provider.of<HomeProvider>(context, listen: false).selectedIndex;
        unawaited(_refreshTabData(selected, force: true));
      }
    } else if (state == AppLifecycleState.hidden) {
      event = 'App is hidden';
    } else if (state == AppLifecycleState.detached) {
      event = 'App is detached';
    } else {
      return;
    }
    Logger.debug(event);
    PlatformManager.instance.crashReporter.logInfo(event);
  }

  ///Screens with respect to subpage
  final Map<String, Widget> screensWithRespectToPath = {
    '/facts': const MemoriesPage(),
  };
  bool? previousConnection;

  void _onReceiveTaskData(dynamic data) async {
    if (data is! Map<String, dynamic>) return;
    if (!(data.containsKey('latitude') && data.containsKey('longitude')))
      return;
    await updateUserGeolocation(
      geolocation: Geolocation(
        latitude: data['latitude'],
        longitude: data['longitude'],
        accuracy: data['accuracy'],
        altitude: data['altitude'],
        time: DateTime.parse(data['time']).toUtc(),
      ),
    );
  }

  @override
  void initState() {
    _pages = [
      MessagesPage(key: _messagesPageKey),
      TasksPage(key: _tasksPageKey),
      ChatTabPage(key: _chatPageKey),
      MyPage(key: _myPageKey),
    ];
    SharedPreferencesUtil().onboardingCompleted = true;
    updateUserOnboardingState(completed: true);

    // Navigate uri
    Uri? navigateToUri;
    var pageAlias = "home";
    var homePageIdx = 0;
    String? detailPageId;

    if (widget.navigateToRoute != null && widget.navigateToRoute!.isNotEmpty) {
      navigateToUri = Uri.tryParse(
        "http://localhost.com${widget.navigateToRoute!}",
      );
      Logger.debug("initState ${navigateToUri?.pathSegments.join("...")}");
      var segments = navigateToUri?.pathSegments ?? [];
      if (segments.isNotEmpty) {
        pageAlias = segments[0];
      }
      if (segments.length > 1) {
        detailPageId = segments[1];
      }

      switch (pageAlias) {
        case "messages":
          homePageIdx = 0;
          break;
        case "action-items":
        case "todos":
          homePageIdx = 1;
          break;
        case "chat":
          homePageIdx = 2;
          break;
        case "my":
        case "settings":
          homePageIdx = 3;
          break;
      }
    }

    // Home controller
    context.read<HomeProvider>().selectedIndex = homePageIdx;
    unawaited(_refreshTabData(homePageIdx, force: true));
    _tabAutoRefreshTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (!mounted) return;
      final selected = context.read<HomeProvider>().selectedIndex;
      unawaited(_refreshTabData(selected));
    });
    context.read<NotificationCenterProvider>().startPolling();
    WidgetsBinding.instance.addObserver(this);

    // Pre-warm agent VM and WebSocket so session is ready by the time the user opens chat
    if (SharedPreferencesUtil().claudeAgentEnabled) {
      print(
        '[HomePage] claudeAgentEnabled=true, calling ensureAgentVm + starting keepalive + preConnectAgent',
      );
      ensureAgentVm();
      final messageProvider = Provider.of<MessageProvider>(
        context,
        listen: false,
      );
      messageProvider.startVmKeepalive();
      messageProvider.preConnectAgent();
    } else {
      print('[HomePage] claudeAgentEnabled=false, skipping VM ensure');
    }

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      _initiateApps();

      // Request permissions before starting foreground service
      if (!PlatformService.isDesktop) {
        await ForegroundUtil.requestPermissions();
        await ForegroundUtil.initializeForegroundService();
        await ForegroundUtil.startForegroundTask();
      }
      if (mounted) {
        await Provider.of<HomeProvider>(context, listen: false).setUserPeople();
      }
      if (mounted) {
        await Provider.of<CaptureProvider>(
          context,
          listen: false,
        ).streamDeviceRecording(
          device:
              Provider.of<DeviceProvider>(
                context,
                listen: false,
              ).connectedDevice,
        );
      }
      if (mounted) {
        await Future.wait([
          context.read<NotificationCenterProvider>().refresh(force: true),
          context.read<NotificationCenterProvider>().pollDraftTodos(
            force: true,
          ),
        ]);
      }

      // Navigate
      if (!mounted) return;
      switch (pageAlias) {
        case "apps":
          if (detailPageId != null && detailPageId.isNotEmpty) {
            final appProvider = context.read<AppProvider>();
            var app = await appProvider.getAppFromId(detailPageId);
            if (app != null && mounted) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => AppDetailPage(app: app),
                ),
              );
            }
          }
          break;
        case "chat":
          Logger.debug('inside chat alias $detailPageId');
          if (detailPageId != null && detailPageId.isNotEmpty) {
            var appId =
                detailPageId != "omi" ? detailPageId : ''; // omi ~ no select
            if (mounted) {
              var appProvider = Provider.of<AppProvider>(
                context,
                listen: false,
              );
              var messageProvider = Provider.of<MessageProvider>(
                context,
                listen: false,
              );
              App? selectedApp;
              if (appId.isNotEmpty) {
                selectedApp = await appProvider.getAppFromId(appId);
              }
              appProvider.setSelectedChatAppId(appId);
              await messageProvider.refreshMessages();
              if (messageProvider.messages.isEmpty) {
                messageProvider.sendInitialAppMessage(selectedApp);
              }
            }
          } else {
            if (mounted) {
              await Provider.of<MessageProvider>(
                context,
                listen: false,
              ).refreshMessages();
            }
          }
          // Chat is part of home tabs. Keep user in-tab and only prefetch data.
          break;
        case "settings":
          // Use context from the current widget instead of navigator key for bottom sheet
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              SettingsDrawer.show(context);
            }
          });
          if (detailPageId == 'data-privacy') {
            MyApp.navigatorKey.currentState?.push(
              MaterialPageRoute(builder: (context) => const DataPrivacyPage()),
            );
          }
          break;
        case "facts":
          MyApp.navigatorKey.currentState?.push(
            MaterialPageRoute(builder: (context) => const MemoriesPage()),
          );
          break;
        case "conversation":
          // Handle conversation deep link: /conversation/{id}?share=1
          if (detailPageId != null && detailPageId.isNotEmpty) {
            // Check for share query param
            final shouldOpenShare =
                navigateToUri?.queryParameters['share'] == '1';
            final conversationId = detailPageId; // Capture non-null value

            WidgetsBinding.instance.addPostFrameCallback((_) async {
              if (!mounted) return;

              // Fetch conversation from server
              final conversation = await getConversationById(conversationId);
              if (conversation != null && mounted) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder:
                        (context) => ConversationDetailPage(
                          conversation: conversation,
                          openShareToContactsOnLoad: shouldOpenShare,
                        ),
                  ),
                );
              } else {
                Logger.debug('Conversation not found: $conversationId');
              }
            });
          }
          break;
        case "daily-summary":
          if (detailPageId != null && detailPageId.isNotEmpty) {
            // Track notification opened
            MixpanelManager().dailySummaryNotificationOpened(
              summaryId: detailPageId,
              date:
                  '', // Date not available in navigate_to, will be fetched when detail page loads
            );

            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder:
                        (context) =>
                            DailySummaryDetailPage(summaryId: detailPageId!),
                  ),
                );
              }
            });
          }
          break;
        case "wrapped":
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const Wrapped2025Page(),
                ),
              );
            }
          });
          break;
        case "action-items":
          // Tab index already set to 1 (tasks tab) above
          break;
        default:
      }
    });

    _listenToMessagesFromNotification();
    _listenToFreemiumThreshold();
    _checkForAnnouncements();
    super.initState();

    // After init
    FlutterForegroundTask.addTaskDataCallback(_onReceiveTaskData);
  }

  Future<void> _refreshTabData(int index, {bool force = false}) async {
    final now = DateTime.now();
    final last = _tabLastRefreshAt[index];
    if (!force && last != null && now.difference(last).inSeconds < 20) {
      return;
    }
    _tabLastRefreshAt[index] = now;

    try {
      if (!mounted) return;
      switch (index) {
        case 0:
          await Future.wait([
            context.read<NotificationCenterProvider>().refresh(force: force),
            context.read<NotificationCenterProvider>().pollDraftTodos(
              force: force,
            ),
          ]);
          break;
        case 1:
          await context.read<MobileDataProvider>().refreshTasks();
          break;
        case 2:
          await context.read<MobileDataProvider>().refreshMessages();
          break;
        default:
          break;
      }
    } catch (_) {}
  }

  void _checkForAnnouncements() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;

      await Future.delayed(const Duration(seconds: 2));

      if (!mounted) return;

      final announcementProvider = Provider.of<AnnouncementProvider>(
        context,
        listen: false,
      );
      final deviceProvider = Provider.of<DeviceProvider>(
        context,
        listen: false,
      );
      await AnnouncementService().checkAndShowAnnouncements(
        context,
        announcementProvider,
        connectedDevice: deviceProvider.connectedDevice,
      );

      // Register callback for device connection to check firmware announcements
      deviceProvider.onDeviceConnected = _onDeviceConnectedForAnnouncements;
    });
  }

  void _onDeviceConnectedForAnnouncements(BtDevice device) async {
    if (!mounted) return;

    final announcementProvider = Provider.of<AnnouncementProvider>(
      context,
      listen: false,
    );
    await AnnouncementService().showFirmwareUpdateAnnouncements(
      context,
      announcementProvider,
      device.firmwareRevision,
      device.modelNumber,
    );
  }

  void _listenToFreemiumThreshold() {
    // Listen to capture provider for freemium threshold events
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      _captureProvider = Provider.of<CaptureProvider>(context, listen: false);
      _captureProvider!.addListener(_onCaptureProviderChanged);
      // Connect freemium session reset callback
      _captureProvider!.onFreemiumSessionReset = () {
        _freemiumHandler.resetDialogFlag();
      };
    });
  }

  void _onCaptureProviderChanged() {
    if (!mounted || _captureProvider == null) return;

    _freemiumHandler.checkAndShowDialog(context, _captureProvider!).catchError((
      e,
    ) {
      Logger.debug('[Freemium] Error checking dialog: $e');
      return false;
    });
  }

  void _listenToMessagesFromNotification() {
    _notificationStreamSubscription = NotificationService
        .instance
        .listenForServerMessages
        .listen((message) {
          if (mounted) {
            var selectedApp =
                Provider.of<AppProvider>(
                  context,
                  listen: false,
                ).getSelectedApp();
            if (selectedApp == null || message.appId == selectedApp.id) {
              Provider.of<MessageProvider>(
                context,
                listen: false,
              ).addMessage(message);
            }
            // chatPageKey.currentState?.scrollToBottom();
          }
        });
  }

  @override
  Widget build(BuildContext context) {
    return MyUpgradeAlert(
      upgrader: _upgrader,
      dialogStyle:
          Platform.isIOS
              ? UpgradeDialogStyle.cupertino
              : UpgradeDialogStyle.material,
      child: Consumer<ConnectivityProvider>(
        builder: (ctx, connectivityProvider, child) {
          bool isConnected = connectivityProvider.isConnected;
          previousConnection ??= true;

          if (previousConnection != isConnected &&
              connectivityProvider.isInitialized &&
              connectivityProvider.previousConnection != isConnected) {
            previousConnection = isConnected;
            if (!isConnected) {
              // TODO: Re-enable when internet connection banners are redesigned
              // Future.delayed(const Duration(seconds: 2), () {
              //   if (mounted && !connectivityProvider.isConnected) {
              //     ScaffoldMessenger.of(ctx).showMaterialBanner(
              //       MaterialBanner(
              //         content: const Text(
              //           'No internet connection. Please check your connection.',
              //           style: TextStyle(color: Colors.white70),
              //         ),
              //         backgroundColor: const Color(0xFF424242), // Dark gray instead of red
              //         leading: const Icon(Icons.wifi_off, color: Colors.white70),
              //         actions: [
              //           TextButton(
              //             onPressed: () {
              //               ScaffoldMessenger.of(ctx).hideCurrentMaterialBanner();
              //             },
              //             child: const Text('Dismiss', style: TextStyle(color: Colors.white70)),
              //           ),
              //         ],
              //       ),
              //     );
              //   }
              // });
            } else {
              Future.delayed(Duration.zero, () {
                // TODO: Re-enable when internet connection banners are redesigned
                // if (mounted) {
                //   ScaffoldMessenger.of(ctx).hideCurrentMaterialBanner();
                //   ScaffoldMessenger.of(ctx).showMaterialBanner(
                //     MaterialBanner(
                //       content: const Text(
                //         'Internet connection is restored.',
                //         style: TextStyle(color: Colors.white),
                //       ),
                //       backgroundColor: const Color(0xFF2E7D32), // Dark green instead of bright green
                //       leading: const Icon(Icons.wifi, color: Colors.white),
                //       actions: [
                //         TextButton(
                //           onPressed: () {
                //             if (mounted) {
                //               ScaffoldMessenger.of(ctx).hideCurrentMaterialBanner();
                //             }
                //           },
                //           child: const Text('Dismiss', style: TextStyle(color: Colors.white)),
                //         ),
                //       ],
                //       onVisible: () => Future.delayed(const Duration(seconds: 3), () {
                //         if (mounted) {
                //           ScaffoldMessenger.of(ctx).hideCurrentMaterialBanner();
                //         }
                //       }),
                //     ),
                //   );
                // }

                WidgetsBinding.instance.addPostFrameCallback((_) async {
                  if (!mounted) return;

                  final convoProvider = ctx.read<ConversationProvider>();
                  final messageProvider = ctx.read<MessageProvider>();

                  if (convoProvider.conversations.isEmpty) {
                    await convoProvider.getInitialConversations();
                  } else {
                    // Force refresh when internet connection is restored
                    await convoProvider.forceRefreshConversations();
                  }

                  if (messageProvider.messages.isEmpty) {
                    await messageProvider.refreshMessages();
                  }
                });
              });
            }
          }
          return child!;
        },
        child: Consumer<HomeProvider>(
          builder: (context, homeProvider, _) {
            return Scaffold(
              backgroundColor: MobileTokens.background,
              resizeToAvoidBottomInset: false,
              extendBody: false,
              appBar: null,
              body: DefaultTabController(
                length: 4,
                initialIndex: homeProvider.selectedIndex,
                child: GestureDetector(
                  onTap: () {
                    primaryFocus?.unfocus();
                    // context.read<HomeProvider>().memoryFieldFocusNode.unfocus();
                    // context.read<HomeProvider>().chatFieldFocusNode.unfocus();
                  },
                  child: Column(
                    children: [
                      SafeArea(
                        top: true,
                        bottom: false,
                        child: const TopStatusBar(),
                      ),
                      Expanded(
                        child: IndexedStack(
                          index: context.watch<HomeProvider>().selectedIndex,
                          children: _pages,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              bottomNavigationBar: Consumer<HomeProvider>(
                builder: (context, home, child) {
                  if (home.isChatFieldFocused ||
                      home.isAppsSearchFieldFocused ||
                      home.isMemoriesSearchFieldFocused) {
                    return const SizedBox.shrink();
                  }
                  return BottomNavBar(
                    onTabTap: (index, isRepeat) {
                      if (isRepeat) {
                        _scrollToTop(index);
                      } else {
                        home.setIndex(index);
                        unawaited(_refreshTabData(index));
                      }
                    },
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _handleRecordButtonPress(
    BuildContext context,
    CaptureProvider captureProvider,
  ) async {
    var recordingState = captureProvider.recordingState;

    if (recordingState == RecordingState.record) {
      // Stop recording and summarize conversation
      await captureProvider.stopStreamRecording();
      captureProvider.forceProcessingCurrentConversation();
      MixpanelManager().phoneMicRecordingStopped();
    } else if (recordingState == RecordingState.initialising) {
      // Already initializing, do nothing
      Logger.debug('initialising, have to wait');
    } else {
      // Start recording directly without dialog
      await captureProvider.streamRecording();
      MixpanelManager().phoneMicRecordingStarted();

      // Navigate to conversation capturing page
      if (context.mounted) {
        var topConvoId =
            (captureProvider.conversationProvider?.conversations ?? [])
                    .isNotEmpty
                ? captureProvider.conversationProvider!.conversations.first.id
                : null;
        Navigator.push(
          context,
          MaterialPageRoute(
            builder:
                (context) =>
                    ConversationCapturingPage(topConversationId: topConvoId),
          ),
        );
      }
    }
  }

  PreferredSizeWidget _buildAppBar(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: false,
      backgroundColor: Theme.of(context).colorScheme.surface,
      title: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const BatteryInfoWidget(),
          const SizedBox.shrink(),
          Row(
            children: [
              // Sync icon - shows when there are pending files on device or a device is paired
              // Only shown on messages page (index 0)
              Consumer3<HomeProvider, DeviceProvider, SyncProvider>(
                builder: (
                  context,
                  homeProvider,
                  deviceProvider,
                  syncProvider,
                  child,
                ) {
                  final device = deviceProvider.pairedDevice;
                  // Only show orange indicator for files still on device (SD card or Limitless)
                  final hasPendingOnDevice =
                      syncProvider.missingWalsOnDevice.isNotEmpty;
                  final isSyncing = syncProvider.isSyncing;

                  // Show sync icon only on messages page and if there's a paired device OR if there are pending files on device
                  if (homeProvider.selectedIndex == 0 &&
                      (device != null || hasPendingOnDevice)) {
                    return GestureDetector(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const SyncPage(),
                          ),
                        );
                      },
                      child: Container(
                        width: 36,
                        height: 36,
                        margin: const EdgeInsets.only(right: 8),
                        decoration: BoxDecoration(
                          color:
                              isSyncing
                                  ? Colors.deepPurple.withOpacity(0.2)
                                  : hasPendingOnDevice
                                  ? Colors.orange.withOpacity(0.15)
                                  : const Color(0xFF1F1F25),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.cloud_rounded,
                          size: 18,
                          color:
                              isSyncing
                                  ? Colors.deepPurpleAccent
                                  : hasPendingOnDevice
                                  ? Colors.orangeAccent
                                  : Colors.white70,
                        ),
                      ),
                    );
                  }
                  return const SizedBox.shrink();
                },
              ),
              // Search and Calendar buttons - only on messages page (index 0)
              Consumer2<HomeProvider, ConversationProvider>(
                builder: (context, homeProvider, convoProvider, _) {
                  // Only show search and calendar buttons on messages page (index 0)
                  if (homeProvider.selectedIndex != 0) {
                    return const SizedBox.shrink();
                  }

                  // Hide search button if there's an active search query
                  bool shouldShowSearchButton =
                      convoProvider.previousQuery.isEmpty;
                  return Row(
                    children: [
                      // Search button - show when no active search, clicking closes search bar
                      if (shouldShowSearchButton)
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color:
                                homeProvider.showConvoSearchBar
                                    ? Colors.deepPurple.withOpacity(0.5)
                                    : const Color(0xFF1F1F25),
                            shape: BoxShape.circle,
                          ),
                          child: IconButton(
                            padding: EdgeInsets.zero,
                            icon: const Icon(
                              Icons.search,
                              size: 18,
                              color: Colors.white70,
                            ),
                            onPressed: () {
                              HapticFeedback.mediumImpact();
                              // Toggle search bar visibility
                              homeProvider.toggleConvoSearchBar();
                            },
                          ),
                        ),
                      if (shouldShowSearchButton) const SizedBox(width: 8),
                      // Daily Recaps toggle button
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color:
                              convoProvider.showDailySummaries
                                  ? Colors.deepPurple.withOpacity(0.5)
                                  : const Color(0xFF1F1F25),
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: Icon(
                            FontAwesomeIcons.clockRotateLeft,
                            size: 16,
                            color:
                                convoProvider.showDailySummaries
                                    ? Colors.white
                                    : Colors.white70,
                          ),
                          onPressed: () {
                            HapticFeedback.mediumImpact();
                            if (!convoProvider.showDailySummaries) {
                              MixpanelManager().recapTabOpened();
                            }
                            convoProvider.toggleDailySummaries();
                          },
                        ),
                      ),
                      // Calendar button - only show when date filter is active
                      if (convoProvider.selectedDate != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.deepPurple.withOpacity(0.5),
                            shape: BoxShape.circle,
                          ),
                          child: IconButton(
                            padding: EdgeInsets.zero,
                            icon: const Icon(
                              FontAwesomeIcons.calendarDay,
                              size: 16,
                              color: Colors.white,
                            ),
                            onPressed: () async {
                              HapticFeedback.mediumImpact();
                              // Open date picker to change date, cancel clears filter
                              DateTime selectedDate =
                                  convoProvider.selectedDate ?? DateTime.now();
                              await showCupertinoModalPopup<void>(
                                context: context,
                                builder: (BuildContext context) {
                                  return Container(
                                    height: 420,
                                    padding: const EdgeInsets.only(top: 6.0),
                                    margin: EdgeInsets.only(
                                      bottom:
                                          MediaQuery.of(
                                            context,
                                          ).viewInsets.bottom,
                                    ),
                                    color: const Color(0xFF1F1F25),
                                    child: SafeArea(
                                      top: false,
                                      child: Column(
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 16.0,
                                              vertical: 8.0,
                                            ),
                                            decoration: const BoxDecoration(
                                              color: Color(0xFF1F1F25),
                                              border: Border(
                                                bottom: BorderSide(
                                                  color: Color(0xFF35343B),
                                                  width: 0.5,
                                                ),
                                              ),
                                            ),
                                            child: Row(
                                              mainAxisAlignment:
                                                  MainAxisAlignment
                                                      .spaceBetween,
                                              children: [
                                                CupertinoButton(
                                                  padding: EdgeInsets.zero,
                                                  onPressed: () async {
                                                    // Get provider before pop to avoid using invalid context
                                                    final provider =
                                                        Provider.of<
                                                          ConversationProvider
                                                        >(
                                                          context,
                                                          listen: false,
                                                        );
                                                    Navigator.of(context).pop();
                                                    await provider
                                                        .clearDateFilter();
                                                    MixpanelManager()
                                                        .calendarFilterCleared();
                                                  },
                                                  child: Text(
                                                    context.l10n.removeFilter,
                                                    style: const TextStyle(
                                                      color: Colors.white,
                                                      fontSize: 16,
                                                    ),
                                                  ),
                                                ),
                                                const Spacer(),
                                                CupertinoButton(
                                                  padding: EdgeInsets.zero,
                                                  onPressed: () async {
                                                    final provider =
                                                        Provider.of<
                                                          ConversationProvider
                                                        >(
                                                          context,
                                                          listen: false,
                                                        );
                                                    Navigator.of(context).pop();
                                                    await provider
                                                        .filterConversationsByDate(
                                                          selectedDate,
                                                        );
                                                    MixpanelManager()
                                                        .calendarFilterApplied(
                                                          selectedDate,
                                                        );
                                                  },
                                                  child: Text(
                                                    context.l10n.done,
                                                    style: const TextStyle(
                                                      color: Colors.deepPurple,
                                                      fontSize: 16,
                                                      fontWeight:
                                                          FontWeight.w600,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Expanded(
                                            child: Material(
                                              color:
                                                  ResponsiveHelper
                                                      .backgroundSecondary,
                                              child: CalendarDatePicker2(
                                                config:
                                                    getDefaultCalendarConfig(
                                                      firstDate: DateTime(2020),
                                                      lastDate: DateTime.now(),
                                                      currentDate:
                                                          DateTime.now(),
                                                    ),
                                                value: [selectedDate],
                                                onValueChanged: (dates) {
                                                  if (dates.isNotEmpty) {
                                                    selectedDate = dates[0];
                                                  }
                                                },
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              );
                            },
                          ),
                        ),
                      ],
                      const SizedBox(width: 8),
                    ],
                  );
                },
              ),
              // Action items page buttons - export and completed toggle
              Consumer2<HomeProvider, ActionItemsProvider>(
                builder: (context, homeProvider, actionItemsProvider, _) {
                  if (homeProvider.selectedIndex != 1) {
                    return const SizedBox.shrink();
                  }
                  final showCompleted = actionItemsProvider.showCompletedView;
                  return Row(
                    children: [
                      // Export button
                      Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(
                          color: Color(0xFF1F1F25),
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: const Icon(
                            FontAwesomeIcons.arrowUpFromBracket,
                            size: 16,
                            color: Colors.white70,
                          ),
                          onPressed: () {
                            HapticFeedback.mediumImpact();
                            MixpanelManager().exportTasksBannerClicked();
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder:
                                    (context) => const TaskIntegrationsPage(),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Completed toggle
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color:
                              showCompleted
                                  ? Colors.deepPurple.withOpacity(0.5)
                                  : const Color(0xFF1F1F25),
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: Icon(
                            FontAwesomeIcons.solidCircleCheck,
                            size: 16,
                            color:
                                showCompleted ? Colors.white : Colors.white70,
                          ),
                          onPressed: () {
                            HapticFeedback.mediumImpact();
                            actionItemsProvider.toggleShowCompletedView();
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                  );
                },
              ),
              // Settings button - always visible
              Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(
                  color: Color(0xFF1F1F25),
                  shape: BoxShape.circle,
                ),
                child: IconButton(
                  padding: EdgeInsets.zero,
                  icon: const Icon(
                    FontAwesomeIcons.gear,
                    size: 16,
                    color: Colors.white70,
                  ),
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    MixpanelManager().pageOpened('Settings');
                    String language =
                        SharedPreferencesUtil().userPrimaryLanguage;
                    bool hasSpeech = SharedPreferencesUtil().hasSpeakerProfile;
                    String transcriptModel =
                        SharedPreferencesUtil().transcriptionModel;
                    SettingsDrawer.show(context);
                    if (language !=
                            SharedPreferencesUtil().userPrimaryLanguage ||
                        hasSpeech !=
                            SharedPreferencesUtil().hasSpeakerProfile ||
                        transcriptModel !=
                            SharedPreferencesUtil().transcriptionModel) {
                      if (context.mounted) {
                        context
                            .read<CaptureProvider>()
                            .onRecordProfileSettingChanged();
                      }
                    }
                  },
                ),
              ),
            ],
          ),
        ],
      ),
      elevation: 0,
      centerTitle: true,
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tabAutoRefreshTimer?.cancel();
    // Stop VM keepalive timer
    try {
      Provider.of<MessageProvider>(context, listen: false).stopVmKeepalive();
    } catch (_) {}
    // Cancel stream subscription to prevent memory leak
    _notificationStreamSubscription?.cancel();
    // Remove capture provider listener using stored reference
    if (_captureProvider != null) {
      _captureProvider!.removeListener(_onCaptureProviderChanged);
      _captureProvider!.onFreemiumSessionReset = null;
      _captureProvider = null;
    }
    // Remove device provider callback
    try {
      final deviceProvider = Provider.of<DeviceProvider>(
        context,
        listen: false,
      );
      deviceProvider.onDeviceConnected = null;
    } catch (_) {}
    // Clean up freemium handler
    _freemiumHandler.dispose();
    // Remove foreground task callback to prevent memory leak
    FlutterForegroundTask.removeTaskDataCallback(_onReceiveTaskData);
    // Do NOT stop the foreground service here — Android may dispose the
    // Activity while the app is backgrounded.  Stopping the service removes
    // the process-keep-alive protection and lets the OS kill the app.
    // The foreground service will be stopped when the user explicitly
    // disconnects the device via CaptureProvider.
    super.dispose();
  }
}
