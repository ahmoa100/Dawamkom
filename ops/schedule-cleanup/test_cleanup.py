import copy
import unittest
from cleanup import plan


class CleanupTest(unittest.TestCase):
    def test_only_future_dangling_assignments(self):
        w = {'staff': [{'id': 'a', 'branchId': 'men'}], 'workPeriods': [
            {'id': 'good'}, {'id': 'disabled', 'disabledBranchIds': ['men']},
            {'id': 'other', 'branchIds': ['women']}], 'punches': [{'raw': 'unchanged'}],
            'workAssignments': [
                {'staffId': 'a', 'date': '2026-11-21', 'periodId': 'disabled'},
                {'staffId': 'a', 'date': '2026-11-22', 'periodId': 'good'},
                {'staffId': 'a', 'date': '2026-11-22', 'periodId': 'disabled'},
                {'staffId': 'a', 'date': '2026-11-23', 'periodId': 'other'},
                {'staffId': 'a', 'date': '2026-11-24', 'periodId': 'missing'},
                {'staffId': 'a', 'date': '2026-11-25', 'periodId': None, 'restDay': True}]}
        snapshot = {'state': copy.deepcopy(w), 'partners': [{'id': 'company', 'workspace': copy.deepcopy(w)}], 'profile': {'preserve': True}}
        original = copy.deepcopy(snapshot)
        result, removed, digest = plan(snapshot, '2026-11-22')
        self.assertEqual(snapshot, original)
        self.assertEqual(len(removed), 6)
        self.assertEqual(len(digest), 64)
        self.assertEqual(result['state']['workAssignments'], [w['workAssignments'][i] for i in [0, 1, 5]])
        self.assertEqual(result['state']['punches'], w['punches'])
        self.assertEqual(result['profile'], snapshot['profile'])
        self.assertEqual(plan(result, '2026-11-22')[1], [])


if __name__ == '__main__':
    unittest.main()
