import io
import unittest
from datetime import datetime, timezone
from copy_state import run, SOURCE_BUCKET, TARGET_BUCKET, STATE_KEY, PREVIEW_KEY


class Missing(Exception):
    pass


class Store:
    class exceptions:
        NoSuchKey = Missing

    def __init__(self):
        self.objects = {}
        self.writes = []

    def get_bucket_versioning(self, **kwargs):
        return {'Status': 'Enabled'}

    def head_object(self, **kwargs):
        return {'VersionId': 'original'}

    def get_paginator(self, name):
        return self

    def paginate(self, **kwargs):
        return [{'Versions': [{'Key': STATE_KEY, 'VersionId': 'original', 'Size': 2,
                               'LastModified': datetime.now(timezone.utc)}]}]

    def get_object(self, Bucket, Key, **kwargs):
        if Bucket == SOURCE_BUCKET:
            return {'Body': io.BytesIO(b'{}')}
        if Key not in self.objects:
            raise Missing()
        return {'Body': io.BytesIO(self.objects[Key]), 'VersionId': 'copied'}

    def put_object(self, Bucket, Key, Body, **kwargs):
        assert Bucket == TARGET_BUCKET
        self.writes.append(Key)
        self.objects[Key] = Body
        return {'VersionId': 'copied'}


class CopyTests(unittest.TestCase):
    def test_inventory_never_writes(self):
        source, target = Store(), Store()
        self.assertEqual(run(source, target)['versions'], 1)
        self.assertEqual(target.writes, [])

    def test_archive_preview_resume_never_writes_live(self):
        source, target = Store(), Store()
        result = run(source, target, True)
        self.assertFalse(result['productionStateWritten'])
        self.assertIn(PREVIEW_KEY, target.writes)
        self.assertNotIn(STATE_KEY, target.writes)
        archive = [k for k in target.writes if k.startswith('migration-history/')]
        self.assertEqual(len(archive), 1)
        target.writes = []
        run(source, target, True)
        self.assertNotIn(archive[0], target.writes)
        target.objects[archive[0]] = b'corrupted'
        with self.assertRaisesRegex(RuntimeError, 'refusing overwrite'):
            run(source, target, True)

    def test_versioning_required(self):
        target = Store()
        target.get_bucket_versioning = lambda **kwargs: {}
        with self.assertRaisesRegex(RuntimeError, 'versioning'):
            run(Store(), target, True)
        self.assertEqual(target.writes, [])


if __name__ == '__main__':
    unittest.main()
