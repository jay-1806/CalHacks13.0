import unittest
from datetime import datetime, timezone

from planner import WeakConcept, build_learning_plan, priority, route

NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)


class RouteTests(unittest.TestCase):
    def test_routes_by_keyword_and_mode(self):
        self.assertEqual(route("Where did I go wrong?", "explain").selected_agent, "MisconceptionDetectorAgent")
        self.assertEqual(route("quiz me on derivatives", "explain").selected_agent, "QuizGeneratorAgent")
        self.assertEqual(route("anything", "research").selected_agent, "ResourceFinderAgent")
        self.assertEqual(route("what should I study next", "explain").selected_agent, "LearningPlanAgent")
        self.assertEqual(route("explain this integral", "explain").selected_agent, "MathTutorAgent")


class PlanTests(unittest.TestCase):
    def test_empty_profile_gets_encouragement(self):
        plan = build_learning_plan([], NOW)
        self.assertEqual(plan["concept"], "general")
        self.assertEqual(plan["plan"], [])

    def test_orders_by_struggle_repetition_and_staleness(self):
        fresh_mild = WeakConcept("chain_rule", 0.5, 1, "2026-10-24T00:00:00Z")
        stale_strong = WeakConcept("u_substitution", 0.9, 4, "2026-10-10T00:00:00Z")
        self.assertGreater(priority(stale_strong, NOW), priority(fresh_mild, NOW))

        plan = build_learning_plan([fresh_mild, stale_strong], NOW)
        self.assertEqual(plan["concept"], "u_substitution")
        self.assertEqual([p["concept"] for p in plan["plan"]], ["u_substitution", "chain_rule"])
        self.assertTrue(plan["spokenText"].startswith("Start with u substitution, then chain rule"))

    def test_caps_plan_length(self):
        concepts = [WeakConcept(f"c{i}", 0.5, 1, "2026-10-20T00:00:00Z") for i in range(6)]
        self.assertEqual(len(build_learning_plan(concepts, NOW, limit=3)["plan"]), 3)

    def test_tolerates_bad_timestamps(self):
        plan = build_learning_plan([WeakConcept("algebra", 0.6, 2, "not-a-date")], NOW)
        self.assertEqual(plan["concept"], "algebra")


if __name__ == "__main__":
    unittest.main()
