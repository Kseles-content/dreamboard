import 'package:dreamboard_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('renders login shell', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const DreamBoardApp());
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('DreamBoard Login'), findsOneWidget);
    expect(find.text('Login'), findsOneWidget);
  });
}
