import 'package:flutter_test/flutter_test.dart';
import 'package:dreamboard_mobile/main.dart';

void main() {
  testWidgets('renders login shell', (WidgetTester tester) async {
    await tester.pumpWidget(const DreamBoardApp());
    await tester.pumpAndSettle();

    expect(find.text('DreamBoard Login'), findsOneWidget);
    expect(find.text('Login'), findsOneWidget);
  });
}
