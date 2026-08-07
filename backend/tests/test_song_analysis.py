"""song_analysis 核心纯函数测试"""
from song_analysis import _merge_chord_lists


class TestMergeChordLists:
    def test_merges_and_sorts_by_time(self):
        left = [{"time": "0:10", "chord": "C"}, {"time": "0:05", "chord": "G"}]
        right = [{"time": "0:07", "chord": "Am"}]
        merged = _merge_chord_lists(left, right)
        assert [item["chord"] for item in merged] == ["G", "Am", "C"]

    def test_filters_non_dict_entries(self):
        left = [{"time": "0:00", "chord": "C"}, "garbage", None, 42]
        right = [{"time": "0:01", "chord": "D"}, [1, 2]]
        merged = _merge_chord_lists(left, right)
        assert len(merged) == 2
        assert all(isinstance(item, dict) for item in merged)

    def test_handles_missing_timestamp_last(self):
        left = [{"chord": "C"}]  # 无 time 字段
        right = [{"time": "0:00", "chord": "G"}]
        merged = _merge_chord_lists(left, right)
        # 无时间戳的排最后
        assert merged[-1]["chord"] == "C"
        assert merged[0]["chord"] == "G"
