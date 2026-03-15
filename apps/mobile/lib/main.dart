import 'package:flutter/material.dart';

void main() {
  runApp(const DreamBoardApp());
}

class DreamBoardApp extends StatelessWidget {
  const DreamBoardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: Scaffold(
        body: Center(child: Text('DreamBoard Mobile Foundation')),
      ),
    );
  }
}
