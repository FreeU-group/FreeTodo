import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:web_socket_channel/io.dart';

import 'package:freeu/backend/http/shared.dart';
import 'package:freeu/backend/preferences.dart';
import 'package:freeu/env/env.dart';
import 'package:freeu/env/lifetrace_env.dart';
import 'package:freeu/pages/settings/center_node_test_page.dart';
import 'package:freeu/providers/capture_provider.dart';
import 'package:freeu/utils/logger.dart';

class ServerSettingsPage extends StatefulWidget {
  const ServerSettingsPage({super.key});

  @override
  State<ServerSettingsPage> createState() => _ServerSettingsPageState();
}

class _ServerSettingsPageState extends State<ServerSettingsPage> {
  final _tcpController = TextEditingController();
  final _httpController = TextEditingController();

  bool _pinging = false;
  bool? _pingOk;
  String _pingResult = '';

  bool _wsTesting = false;
  bool? _wsOk;
  String _wsResult = '';

  @override
  void initState() {
    super.initState();
    final prefs = SharedPreferencesUtil();
    final savedTcp = prefs.lifetraceTcpUrl.trim();
    final savedHttp = prefs.lifetraceHttpUrl.trim();

    _tcpController.text = savedTcp.isNotEmpty ? savedTcp : LifeTraceEnv.defaultTcpUrl;
    _httpController.text = savedHttp.isNotEmpty ? savedHttp : LifeTraceEnv.defaultHttpUrl;
  }

  @override
  void dispose() {
    _tcpController.dispose();
    _httpController.dispose();
    super.dispose();
  }

  String _normalize(String input, {bool preferHttps = false}) {
    var url = input.trim();
    if (url.isEmpty) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = preferHttps ? 'https://$url' : 'http://$url';
    }
    if (!url.endsWith('/')) url = '$url/';
    return url;
  }

  Future<void> _save() async {
    final tcpUrl = _normalize(_tcpController.text);
    final httpUrl = _normalize(_httpController.text, preferHttps: true);

    if (tcpUrl.isEmpty && httpUrl.isEmpty) return;

    final prefs = SharedPreferencesUtil();
    prefs.lifetraceTcpUrl = tcpUrl;
    prefs.lifetraceHttpUrl = httpUrl;

    // HTTP tunnel → REST API calls
    if (httpUrl.isNotEmpty) {
      Env.overrideApiBaseUrl(httpUrl);
    }
    // TCP tunnel → WebSocket audio streams
    if (tcpUrl.isNotEmpty) {
      Env.overrideWsBaseUrl(tcpUrl);
    }

    Logger.debug('[ServerSettings] Saved TCP=$tcpUrl  HTTP=$httpUrl');
    Logger.debug('[ServerSettings] Env.wsBaseUrl=${Env.wsBaseUrl}  Env.apiBaseUrl=${Env.apiBaseUrl}');

    // Also update legacy key for backward compat
    prefs.lifetraceApiBaseUrl = httpUrl.isNotEmpty ? httpUrl : tcpUrl;

    _tcpController.text = tcpUrl;
    _httpController.text = httpUrl;

    if (mounted) {
      await context.read<CaptureProvider>().onTranscriptionSettingsChanged();
    }

    if (mounted) {
      setState(() {
        _pingOk = null;
        _pingResult = '';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('已保存并应用'),
          backgroundColor: Color(0xFF22C55E),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _resetToDefault() async {
    _tcpController.text = LifeTraceEnv.defaultTcpUrl;
    _httpController.text = LifeTraceEnv.defaultHttpUrl;
    setState(() {
      _pingOk = null;
      _pingResult = '';
    });

    final prefs = SharedPreferencesUtil();
    prefs.lifetraceTcpUrl = '';
    prefs.lifetraceHttpUrl = '';
    prefs.lifetraceApiBaseUrl = '';

    Env.overrideApiBaseUrl(LifeTraceEnv.defaultHttpUrl);
    Env.overrideWsBaseUrl(LifeTraceEnv.defaultTcpUrl);

    if (mounted) {
      await context.read<CaptureProvider>().onTranscriptionSettingsChanged();
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('已恢复默认地址'),
          backgroundColor: Color(0xFF22C55E),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _pingServer() async {
    if (_pinging) return;
    final httpUrl = _normalize(_httpController.text, preferHttps: true);
    if (httpUrl.isEmpty) return;

    setState(() {
      _pinging = true;
      _pingResult = '';
      _pingOk = null;
    });

    final sw = Stopwatch()..start();
    final response = await makeApiCall(
      url: '${httpUrl}v1/users/me',
      headers: {'Authorization': 'Bearer ${LifeTraceEnv.lifetraceToken}'},
      method: 'GET',
      body: '',
      timeout: const Duration(seconds: 10),
      retries: 0,
    );
    sw.stop();
    final elapsed = sw.elapsedMilliseconds;
    if (!mounted) return;

    setState(() {
      _pinging = false;
      if (response == null) {
        _pingOk = false;
        _pingResult = 'HTTP 连接失败：无响应（${elapsed}ms）';
      } else {
        final ok = response.statusCode == 200;
        _pingOk = ok;
        _pingResult = ok
            ? 'HTTP 连接成功：200（${elapsed}ms）'
            : 'HTTP 连接失败：${response.statusCode}（${elapsed}ms）';
      }
    });
  }

  Future<void> _testWebSocket() async {
    if (_wsTesting) return;
    final tcpUrl = _normalize(_tcpController.text);
    if (tcpUrl.isEmpty) return;

    setState(() {
      _wsTesting = true;
      _wsResult = '';
      _wsOk = null;
    });

    final wsUrl = tcpUrl
            .replaceFirst('https://', 'wss://')
            .replaceFirst('http://', 'ws://') +
        'v4/listen?language=zh&sample_rate=16000&codec=opus'
        '&uid=${Uri.encodeComponent(LifeTraceEnv.lifetraceUid)}'
        '&token=${Uri.encodeComponent(LifeTraceEnv.lifetraceToken)}';

    final sw = Stopwatch()..start();
    try {
      final channel = IOWebSocketChannel.connect(
        wsUrl,
        pingInterval: const Duration(seconds: 10),
        connectTimeout: const Duration(seconds: 10),
      );
      await channel.ready.timeout(const Duration(seconds: 10));
      sw.stop();
      final elapsed = sw.elapsedMilliseconds;

      await channel.sink.close();

      if (!mounted) return;
      setState(() {
        _wsTesting = false;
        _wsOk = true;
        _wsResult = 'WebSocket 连接成功（${elapsed}ms）\n$wsUrl';
      });
    } on TimeoutException {
      sw.stop();
      if (!mounted) return;
      setState(() {
        _wsTesting = false;
        _wsOk = false;
        _wsResult = 'WebSocket 超时（${sw.elapsedMilliseconds}ms）\n'
            '请确认 TCP 隧道是否正在运行\n$wsUrl';
      });
    } on SocketException catch (e) {
      sw.stop();
      if (!mounted) return;
      setState(() {
        _wsTesting = false;
        _wsOk = false;
        _wsResult = 'WebSocket 网络错误：${e.message}（${sw.elapsedMilliseconds}ms）\n$wsUrl';
      });
    } catch (e) {
      sw.stop();
      if (!mounted) return;
      setState(() {
        _wsTesting = false;
        _wsOk = false;
        _wsResult = 'WebSocket 失败：$e（${sw.elapsedMilliseconds}ms）\n$wsUrl';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('服务器设置', style: TextStyle(color: Colors.white)),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildUrlField(
              label: 'TCP 隧道',
              description: '用于 WebSocket 音频流传输',
              controller: _tcpController,
              hint: LifeTraceEnv.defaultTcpUrl,
            ),
            const SizedBox(height: 16),
            _buildUrlField(
              label: 'HTTP 隧道',
              description: '用于 REST API 请求',
              controller: _httpController,
              hint: LifeTraceEnv.defaultHttpUrl,
            ),
            const SizedBox(height: 24),
            _buildSaveButton(),
            const SizedBox(height: 16),
            _buildActions(),
            if (_pingResult.isNotEmpty) ...[
              const SizedBox(height: 12),
              _buildTestResult(_pingOk, _pingResult),
            ],
            if (_wsResult.isNotEmpty) ...[
              const SizedBox(height: 8),
              _buildTestResult(_wsOk, _wsResult),
            ],
            const SizedBox(height: 24),
            _buildHint(),
          ],
        ),
      ),
    );
  }

  Widget _buildUrlField({
    required String label,
    required String description,
    required TextEditingController controller,
    required String hint,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(description, style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white, fontSize: 14, fontFamily: 'monospace'),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: TextStyle(color: Colors.grey.shade700),
              filled: true,
              fillColor: const Color(0xFF2C2C2E),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              suffixIcon: IconButton(
                icon: Icon(Icons.copy, size: 16, color: Colors.grey.shade600),
                onPressed: () {
                  final text = controller.text.trim();
                  if (text.isEmpty) return;
                  Clipboard.setData(ClipboardData(text: text));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('已复制'), duration: Duration(seconds: 1)),
                  );
                },
              ),
            ),
            keyboardType: TextInputType.url,
          ),
        ],
      ),
    );
  }

  Widget _buildSaveButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _save,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF22C55E),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: const Text('保存并应用', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
    );
  }

  Widget _buildActions() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _pinging ? null : _pingServer,
                icon: _pinging
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.wifi, size: 16),
                label: const Text('HTTP 测试'),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF3A3A3C)),
                  foregroundColor: Colors.white70,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _wsTesting ? null : _testWebSocket,
                icon: _wsTesting
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.cable, size: 16),
                label: const Text('TCP 测试'),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF3A3A3C)),
                  foregroundColor: Colors.white70,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const CenterNodeTestPage()),
                  );
                },
                icon: const Icon(Icons.checklist, size: 16),
                label: const Text('全面测试'),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF3A3A3C)),
                  foregroundColor: Colors.white70,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _resetToDefault,
                icon: const Icon(Icons.restore, size: 16),
                label: const Text('恢复默认'),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF3A3A3C)),
                  foregroundColor: Colors.white70,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTestResult(bool? ok, String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: (ok == true ? const Color(0xFF22C55E) : Colors.redAccent).withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: ok == true ? const Color(0xFF79E5A0) : Colors.orangeAccent,
          fontSize: 13,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildHint() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.shade900.withOpacity(0.3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: Colors.orange.shade300, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'TCP 隧道用于音频流（WebSocket），HTTP 隧道用于 API 请求。\n两个地址同时生效，保存后自动重连。',
              style: TextStyle(color: Colors.orange.shade300, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
