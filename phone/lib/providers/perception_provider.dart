import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import 'package:freeu/backend/preferences.dart';
import 'package:freeu/services/location_reporter.dart';
import 'package:freeu/utils/logger.dart';

/// 感知权限管理Provider
class PerceptionProvider extends ChangeNotifier {
  bool _perceptionEnabled = true;
  bool _gpsEnabled = false;
  bool _clipboardEnabled = false;
  bool _notificationListenerEnabled = false;

  PerceptionProvider() {
    _loadSettings();
  }

  void _loadSettings() {
    final prefs = SharedPreferencesUtil();
    _perceptionEnabled = true;
    _gpsEnabled = prefs.locationEnabled;
    _clipboardEnabled = false;
    _notificationListenerEnabled = false;

    if (_gpsEnabled) {
      LocationReporter.instance.start();
    }
    notifyListeners();
  }

  bool get perceptionEnabled => _perceptionEnabled;
  bool get gpsEnabled => _gpsEnabled;
  bool get clipboardEnabled => _clipboardEnabled;
  bool get notificationListenerEnabled => _notificationListenerEnabled;

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

  Future<void> setGpsEnabled(bool value) async {
    if (_gpsEnabled == value) return;

    if (value) {
      if (!await Geolocator.isLocationServiceEnabled()) {
        Logger.debug('[PerceptionProvider] Location service not enabled');
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever) {
        Logger.debug('[PerceptionProvider] Location permission permanently denied');
        return;
      }
      if (perm == LocationPermission.denied) {
        return;
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
    LocationReporter.instance.stop();
    super.dispose();
  }
}
