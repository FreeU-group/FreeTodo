import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import 'package:freeu/backend/preferences.dart';
import 'package:freeu/services/location_reporter.dart';
import 'package:freeu/utils/logger.dart';

/// 感知权限管理Provider
class PerceptionProvider extends ChangeNotifier {
  bool _perceptionEnabled = true;
  bool _gpsEnabled = false;
  bool _clipboardEnabled = false;
  bool _notificationListenerEnabled = false;
  String _gpsStatus = '';
  StreamSubscription<String>? _gpsStatusSub;

  PerceptionProvider() {
    _loadSettings();
  }

  void _loadSettings() {
    final prefs = SharedPreferencesUtil();
    _perceptionEnabled = true;
    _gpsEnabled = prefs.locationEnabled;
    _clipboardEnabled = false;
    _notificationListenerEnabled = false;

    _gpsStatusSub = LocationReporter.instance.statusStream.listen((s) {
      _gpsStatus = s;
      notifyListeners();
    });

    if (_gpsEnabled) {
      LocationReporter.instance.start();
    }
    notifyListeners();
  }

  bool get perceptionEnabled => _perceptionEnabled;
  bool get gpsEnabled => _gpsEnabled;
  bool get clipboardEnabled => _clipboardEnabled;
  bool get notificationListenerEnabled => _notificationListenerEnabled;
  String get gpsStatus => _gpsStatus;

  Future<void> setPerceptionEnabled(bool value) async {
    if (_perceptionEnabled == value) return;
    _perceptionEnabled = value;
    if (!value) {
      LocationReporter.instance.stop();
    } else if (_gpsEnabled) {
      LocationReporter.instance.start();
    }
    notifyListeners();
  }

  /// [context] is needed to show the "open settings" dialog when permission
  /// is permanently denied. Pass null when called without a UI context.
  Future<void> setGpsEnabled(bool value, [BuildContext? context]) async {
    if (_gpsEnabled == value) return;

    if (value) {
      var status = await Permission.locationWhenInUse.status;

      if (status.isDenied) {
        status = await Permission.locationWhenInUse.request();
      }

      if (status.isPermanentlyDenied) {
        Logger.debug('[PerceptionProvider] Location permission permanently denied');
        if (context != null && context.mounted) {
          final shouldOpen = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('需要位置权限'),
              content: const Text('GPS 位置上报需要位置权限，请在系统设置中开启。'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
                TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('去设置')),
              ],
            ),
          );
          if (shouldOpen == true) {
            await openAppSettings();
          }
        }
        return;
      }

      if (!status.isGranted) {
        Logger.debug('[PerceptionProvider] Location permission not granted: $status');
        return;
      }

      // Prompt user if system GPS is off, but still enable the reporter.
      // The reporter retries each interval and will succeed once GPS is on.
      if (!await Geolocator.isLocationServiceEnabled()) {
        Logger.debug('[PerceptionProvider] Device location service is OFF');
        if (context != null && context.mounted) {
          unawaited(showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('请开启定位服务'),
              content: const Text('手机的定位服务（GPS）未开启，请在系统设置中打开。\n'
                  '开启后 GPS 位置将自动开始上报。'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('稍后开启')),
                TextButton(onPressed: () {
                  Navigator.pop(ctx, true);
                  Geolocator.openLocationSettings();
                }, child: const Text('去开启')),
              ],
            ),
          ));
        }
      }

      _gpsEnabled = true;
      SharedPreferencesUtil().locationEnabled = true;
      await LocationReporter.instance.start();
    } else {
      _gpsEnabled = false;
      SharedPreferencesUtil().locationEnabled = false;
      LocationReporter.instance.stop();
    }
    notifyListeners();
  }

  Future<void> setClipboardEnabled(bool value) async {
    if (_clipboardEnabled == value) return;

    if (value) {
      // TODO: 请求剪贴板权限（Android需要特殊权限）
    } else {
      _clipboardEnabled = false;
    }
    notifyListeners();
  }

  Future<void> setNotificationListenerEnabled(bool value) async {
    if (_notificationListenerEnabled == value) return;

    if (value) {
      // TODO: 请求通知监听权限（Android需要NotificationListenerService）
    } else {
      _notificationListenerEnabled = false;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _gpsStatusSub?.cancel();
    LocationReporter.instance.stop();
    super.dispose();
  }
}
