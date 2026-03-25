import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  runApp(const DreamBoardApp());
}

class DreamBoardApp extends StatelessWidget {
  const DreamBoardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _loading = true;
  String? _accessToken;
  String? _refreshToken;
  String? _baseUrl;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _baseUrl = prefs.getString('baseUrl') ?? 'http://localhost:3000';
      _accessToken = prefs.getString('accessToken');
      _refreshToken = prefs.getString('refreshToken');
      _loading = false;
    });
  }

  Future<void> _onLoggedIn({
    required String accessToken,
    required String refreshToken,
    required String baseUrl,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('accessToken', accessToken);
    await prefs.setString('refreshToken', refreshToken);
    await prefs.setString('baseUrl', baseUrl);
    setState(() {
      _accessToken = accessToken;
      _refreshToken = refreshToken;
      _baseUrl = baseUrl;
    });
  }

  Future<void> _logout() async {
    if (_refreshToken != null && _baseUrl != null) {
      await ApiClient(baseUrl: _baseUrl!, accessToken: _accessToken)
          .logout(_refreshToken!);
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('accessToken');
    await prefs.remove('refreshToken');

    setState(() {
      _accessToken = null;
      _refreshToken = null;
    });
  }

  Future<void> _unauthorized() async {
    await _logout();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Session expired. Please login again.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_accessToken == null || _baseUrl == null) {
      return LoginScreen(onLoggedIn: _onLoggedIn, initialBaseUrl: _baseUrl);
    }

    return BoardsScreen(
      client: ApiClient(baseUrl: _baseUrl!, accessToken: _accessToken),
      onLogout: _logout,
      onUnauthorized: _unauthorized,
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.onLoggedIn,
    this.initialBaseUrl,
  });

  final Future<void> Function({
    required String accessToken,
    required String refreshToken,
    required String baseUrl,
  }) onLoggedIn;

  final String? initialBaseUrl;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController(text: 'demo@example.com');
  final _nameCtrl = TextEditingController(text: 'Demo');
  late final TextEditingController _baseUrlCtrl;

  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _baseUrlCtrl = TextEditingController(
      text: widget.initialBaseUrl ?? 'http://localhost:3000',
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _nameCtrl.dispose();
    _baseUrlCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final baseUrl = _baseUrlCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    final name = _nameCtrl.text.trim();

    if (baseUrl.isEmpty || email.isEmpty) {
      setState(() => _error = 'Base URL and email are required.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final auth = await ApiClient(baseUrl: baseUrl).login(
        email: email,
        name: name,
      );

      await widget.onLoggedIn(
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        baseUrl: baseUrl,
      );
    } on ApiException catch (e) {
      setState(() => _error = e.userMessage);
    } catch (e) {
      setState(() => _error = 'Unexpected error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('DreamBoard Login')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _baseUrlCtrl,
              decoration: const InputDecoration(labelText: 'API Base URL'),
            ),
            TextField(
              controller: _emailCtrl,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 12),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Login'),
            ),
          ],
        ),
      ),
    );
  }
}

class BoardsScreen extends StatefulWidget {
  const BoardsScreen({
    super.key,
    required this.client,
    required this.onLogout,
    required this.onUnauthorized,
  });

  final ApiClient client;
  final Future<void> Function() onLogout;
  final Future<void> Function() onUnauthorized;

  @override
  State<BoardsScreen> createState() => _BoardsScreenState();
}

class _BoardsScreenState extends State<BoardsScreen> {
  bool _loading = true;
  String? _error;
  List<Board> _boards = [];

  @override
  void initState() {
    super.initState();
    _loadBoards();
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _loadBoards() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final list = await widget.client.listBoards();
      setState(() => _boards = list);
    } on UnauthorizedException {
      await widget.onUnauthorized();
    } on ApiException catch (e) {
      setState(() => _error = e.userMessage);
    } catch (e) {
      setState(() => _error = 'Unexpected error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createBoard() async {
    final titleCtrl = TextEditingController();
    final descriptionCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create board'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            TextField(
              controller: descriptionCtrl,
              decoration: const InputDecoration(labelText: 'Description'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Create'),
          ),
        ],
      ),
    );

    if (ok != true) return;

    final title = titleCtrl.text.trim();
    if (title.isEmpty) {
      _toast('Board title is required.');
      return;
    }

    try {
      await widget.client.createBoard(
        title: title,
        description:
            descriptionCtrl.text.trim().isEmpty ? null : descriptionCtrl.text.trim(),
      );
      await _loadBoards();
      _toast('Board created.');
    } on UnauthorizedException {
      await widget.onUnauthorized();
    } on ApiException catch (e) {
      _toast('Create failed: ${e.userMessage}');
    } catch (e) {
      _toast('Create failed: $e');
    }
  }

  Future<void> _deleteBoard(Board board) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete board'),
        content: Text('Delete "${board.title}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await widget.client.deleteBoard(board.id);
      await _loadBoards();
      _toast('Board deleted.');
    } on UnauthorizedException {
      await widget.onUnauthorized();
    } on ApiException catch (e) {
      _toast('Delete failed: ${e.userMessage}');
    } catch (e) {
      _toast('Delete failed: $e');
    }
  }

  Future<void> _openBoard(Board board) async {
    try {
      final opened = await widget.client.getBoard(board.id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Board #${opened.id}'),
          content: Text(
            'Title: ${opened.title}\nDescription: ${opened.description ?? '-'}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } on UnauthorizedException {
      await widget.onUnauthorized();
    } on ApiException catch (e) {
      _toast('Open failed: ${e.userMessage}');
    } catch (e) {
      _toast('Open failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Boards'),
        actions: [
          IconButton(onPressed: _loadBoards, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: widget.onLogout, icon: const Icon(Icons.logout)),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createBoard,
        child: const Icon(Icons.add),
      ),
      body: Builder(
        builder: (_) {
          if (_loading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (_error != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Error: $_error'),
                    const SizedBox(height: 8),
                    ElevatedButton(onPressed: _loadBoards, child: const Text('Retry')),
                  ],
                ),
              ),
            );
          }

          if (_boards.isEmpty) {
            return const Center(child: Text('No boards yet'));
          }

          return ListView.builder(
            itemCount: _boards.length,
            itemBuilder: (_, i) {
              final b = _boards[i];
              return ListTile(
                title: Text(b.title),
                subtitle: Text(b.description ?? ''),
                onTap: () => _openBoard(b),
                trailing: IconButton(
                  icon: const Icon(Icons.delete),
                  onPressed: () => _deleteBoard(b),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class ApiClient {
  ApiClient({required this.baseUrl, this.accessToken});

  final String baseUrl;
  final String? accessToken;

  Uri _u(String path, [Map<String, dynamic>? q]) => Uri.parse('$baseUrl$path')
      .replace(queryParameters: q?.map((k, v) => MapEntry(k, '$v')));

  Future<AuthTokens> login({required String email, required String name}) async {
    final res = await _request(
      'POST',
      _u('/v1/auth/login'),
      body: {'email': email, 'name': name},
      includeAuth: false,
    );
    return AuthTokens.fromJson(_asMap(res));
  }

  Future<void> logout(String refreshToken) async {
    await _request(
      'POST',
      _u('/v1/auth/logout'),
      body: {'refreshToken': refreshToken},
      includeAuth: false,
    );
  }

  Future<List<Board>> listBoards() async {
    final res = await _request('GET', _u('/v1/boards', {'limit': 50}));
    final map = _asMap(res);
    final items = (map['items'] as List<dynamic>? ?? []);
    return items.map((e) => Board.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Board> createBoard({required String title, String? description}) async {
    final res = await _request(
      'POST',
      _u('/v1/boards'),
      body: {'title': title, 'description': description},
    );
    return Board.fromJson(_asMap(res));
  }

  Future<Board> getBoard(int id) async {
    final res = await _request('GET', _u('/v1/boards/$id'));
    return Board.fromJson(_asMap(res));
  }

  Future<void> deleteBoard(int id) async {
    await _request('DELETE', _u('/v1/boards/$id'));
  }

  Future<http.Response> _request(
    String method,
    Uri uri, {
    Map<String, dynamic>? body,
    bool includeAuth = true,
  }) async {
    final headers = <String, String>{'content-type': 'application/json'};
    if (includeAuth && accessToken != null) {
      headers['authorization'] = 'Bearer $accessToken';
    }

    debugPrint('[api] -> $method $uri');
    late final http.Response res;

    switch (method) {
      case 'GET':
        res = await http.get(uri, headers: headers);
      case 'POST':
        res = await http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
      case 'DELETE':
        res = await http.delete(uri, headers: headers);
      default:
        throw Exception('Unsupported method $method');
    }

    debugPrint('[api] <- $method $uri status=${res.statusCode} body=${res.body}');
    _throwIfBad(res);
    return res;
  }

  Map<String, dynamic> _asMap(http.Response response) {
    final parsed = jsonDecode(response.body);
    if (parsed is Map<String, dynamic>) return parsed;
    throw ApiException(statusCode: response.statusCode, message: 'Invalid response body');
  }

  void _throwIfBad(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) return;
    if (res.statusCode == 401) throw UnauthorizedException();

    String message = res.body;
    try {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      message = (body['message'] as String?) ?? message;
    } catch (_) {
      // Keep raw body if not JSON.
    }

    throw ApiException(statusCode: res.statusCode, message: message);
  }
}

class UnauthorizedException implements Exception {
  @override
  String toString() => 'Unauthorized';
}

class ApiException implements Exception {
  ApiException({required this.statusCode, required this.message});

  final int statusCode;
  final String message;

  String get userMessage {
    switch (statusCode) {
      case 400:
        return 'Bad request. Please check your input.';
      case 401:
        return 'Unauthorized. Please login again.';
      case 403:
        return 'Forbidden for this account.';
      case 404:
        return 'Resource not found.';
      case 500:
        return 'Server error. Please retry later.';
      default:
        return 'Request failed ($statusCode): $message';
    }
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class AuthTokens {
  AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
  });

  final String accessToken;
  final String refreshToken;
  final String tokenType;

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        tokenType: json['tokenType'] as String? ?? 'Bearer',
      );
}

class Board {
  Board({required this.id, required this.title, this.description});

  final int id;
  final String title;
  final String? description;

  factory Board.fromJson(Map<String, dynamic> json) => Board(
        id: json['id'] as int,
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
      );
}
