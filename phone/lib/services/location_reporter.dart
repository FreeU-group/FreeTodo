import 'dart:async';

import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import 'package:freeu/backend/http/api/location.dart';
import 'package:freeu/utils/logger.dart';

/// Periodically reports GPS location to the backend (default: every 60s).
class LocationReporter {
  static LocationReporter? _instance;
  static LocationReporter get instance => _instance ??= LocationReporter._();

  LocationReporter._();

  Timer? _timer;
  bool _running = false;
  String _lastStatus = '未启动';
  int _successCount = 0;
  int _failCount = 0;

  static const _interval = Duration(seconds: 60);

  bool get isRunning => _running;
  String get lastStatus => _lastStatus;
  int get successCount => _successCount;
  int get failCount => _failCount;

  final _statusController = StreamController<String>.broadcast();
  Stream<String> get statusStream => _statusController.stream;

  void _setStatus(String s) {
    _lastStatus = s;
    _statusController.add(s);
    Logger.info('[LocationReporter] $s');
  }

  Future<void> start() async {
    if (_running) return;

    final ok = await _checkPermission();
    if (!ok) return;

    _running = true;
    _setStatus('已启动，等待首次定位...');

    _reportOnce();
    _timer = Timer.periodic(_interval, (_) => _reportOnce());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _running = false;
    _setStatus('已停止');
  }

  Future<bool> _checkPermission() async {
    final status = await Permission.locationWhenInUse.status;
    if (!status.isGranted) {
      _setStatus('权限未授予: $status');
      return false;
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      _setStatus('手机定位服务未开启');
      return false;
    }
    return true;
  }

  Future<void> _reportOnce() async {
    try {
      Position? pos;

      // Try last known position first (instant, no timeout risk)
      pos = await Geolocator.getLastKnownPosition();

      if (pos == null) {
        _setStatus('获取 GPS 定位中...');
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.medium,
            timeLimit: Duration(seconds: 30),
          ),
        );
      }

      final ok = await reportLocation(
        latitude: pos.latitude,
        longitude: pos.longitude,
        altitude: pos.altitude,
        accuracy: pos.accuracy,
        speed: pos.speed,
        heading: pos.heading,
        timestamp: pos.timestamp,
      );

      if (ok) {
        _successCount++;
        _setStatus('上报成功 #$_successCount (${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)})');
      } else {
        _failCount++;
        _setStatus('上报失败 #$_failCount: 后端返回错误');
      }
    } catch (e) {
      _failCount++;
      _setStatus('上报失败 #$_failCount: $e');
    }
  }

  void dispose() {
    stop();
    _statusController.close();
  }
}
