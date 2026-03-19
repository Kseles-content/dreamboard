import 'package:flutter_test/flutter_test.dart';
import 'package:dreamboard_mobile/main.dart';

void main() {
  testWidgets('renders DreamBoardApp root widget', (WidgetTester tester) async {
    await tester.pumpWidget(const DreamBoardApp());
    expect(find.text('DreamBoard Mobile Foundation'), findsOneWidget);
  });
}
