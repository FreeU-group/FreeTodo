import 'dart:async';

import 'package:geolocator/geolocator.dart';

import 'package:freeu/backend/http/api/location.dart';
import 'package:freeu/utils/logger.dart';

/// Periodically reports GPS location to the backend (default: every 60s).
class LocationReporter {
  static LocationReporter? _instance;
  static LocationReporter get instance => _instance ??= LocationReporter._();

  LocationReporter._();

  Timer? _timer;
  bool _running = false;

  static const _interval = Duration(seconds: 60);

  bool get isRunning => _running;

  Future<void> start() async {
    if (_running) return;

    final ok = await _checkPermission();
    if (!ok) {
      Logger.debug('[LocationReporter] Permission not granted, not starting');
      return;
    }

    _running = true;
    Logger.info('[LocationReporter] Started (interval=${_interval.inSeconds}s)');

    _reportOnce();
    _timer = Timer.periodic(_interval, (_) => _reportOnce());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _running = false;
    Logger.info('[LocationReporter] Stopped');
  }

  Future<bool> _checkPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      Logger.debug('[LocationReporter] Location service disabled');
      return false;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always || perm == LocationPermission.whileInUse;
  }

  Future<void> _reportOnce() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );

      await reportLocation(
        latitude: pos.latitude,
        longitude: pos.longitude,
        altitude: pos.altitude,
        accuracy: pos.accuracy,
        speed: pos.speed,
        heading: pos.heading,
        timestamp: pos.timestamp,
      );
    } catch (e) {
      Logger.debug('[LocationReporter] Error: $e');
    }
  }
}
