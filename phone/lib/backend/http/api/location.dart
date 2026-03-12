import 'dart:convert';

import 'package:freeu/backend/http/shared.dart';
import 'package:freeu/env/env.dart';
import 'package:freeu/utils/logger.dart';

Future<bool> reportLocation({
  required double latitude,
  required double longitude,
  double? altitude,
  double? accuracy,
  double? speed,
  double? heading,
  DateTime? timestamp,
}) async {
  final body = <String, dynamic>{
    'latitude': latitude,
    'longitude': longitude,
  };
  if (altitude != null) body['altitude'] = altitude;
  if (accuracy != null) body['accuracy'] = accuracy;
  if (speed != null) body['speed'] = speed;
  if (heading != null) body['heading'] = heading;
  if (timestamp != null) body['timestamp'] = timestamp.toUtc().toIso8601String();
  body['source'] = 'mobile_gps';

  final url = '${Env.apiBaseUrl}api/location/report';
  Logger.debug('[LocationReporter] POST $url');
  var response = await makeApiCall(
    url: url,
    headers: {},
    method: 'POST',
    body: jsonEncode(body),
  );
  if (response == null) {
    Logger.debug('[LocationReporter] report failed: no response (URL: $url)');
    return false;
  }
  if (response.statusCode == 200) {
    Logger.debug('[LocationReporter] GPS fix reported successfully');
    return true;
  }
  Logger.debug('[LocationReporter] report failed: HTTP ${response.statusCode} ${response.body} (URL: $url)');
  return false;
}
