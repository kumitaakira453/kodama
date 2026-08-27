import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import type { WorktreeStatus } from "../lib/types";
import {
  projectsAtom,
  selectedProjectIdAtom,
  selectedWorktreeAtom,
  statusesAtom,
  worktreesAtom,
} from "../state/atoms";
import { useToast } from "./useToast";

/**
 * プロジェクトと worktree の読み込み。
 *
 * 一覧（git 1 回）と状態（worktree ごとに git 数回）を分けて取得し、一覧を先に
 * 描いてから状態を後追いで埋める。worktree が多くても最初の描画を待たせない。
 */
export function useDashboard() {
  const [projects, setProjects] = useAtom(projectsAtom);
  const setWorktrees = useSetAtom(worktreesAtom);
  const setStatuses = useSetAtom(statusesAtom);
  const [selectedProjectId, setSelectedProjectId] = useAtom(
    selectedProjectIdAtom,
  );
  const [selectedWorktree, setSelectedWorktree] = useAtom(selectedWorktreeAtom);
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();

  /** 読み込み中に選択が変わったら古い結果を捨てるための世代番号。 */
  const generation = useRef(0);

  const loadWorktrees = useCallback(
    async (projectId: string, gen: number) => {
      try {
        const list = await api.listWorktrees(projectId);
        if (gen !== generation.current) return;
        setWorktrees((prev) => ({ ...prev, [projectId]: list }));

        const paths = list.map((w) => w.path);
        if (paths.length === 0) return;
        const statuses = await api.worktreeStatuses(projectId, paths);
        if (gen !== generation.current) return;
        setStatuses((prev) => {
          const next = { ...prev };
          statuses.forEach((s: WorktreeStatus) => {
            next[s.path] = s;
          });
          return next;
        });
      } catch (e) {
        if (gen === generation.current) showError(e);
      }
    },
    [setWorktrees, setStatuses, showError],
  );

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    try {
      const list = await api.listProjects();
      if (gen !== generation.current) return;
      setProjects(list);
      await Promise.all(list.map((p) => loadWorktrees(p.id, gen)));
    } catch (e) {
      if (gen === generation.current) showError(e);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [setProjects, loadWorktrees, showError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addProject = useCallback(
    async (path: string) => {
      const project = await api.addProject(path);
      setProjects((prev) => [...prev, project]);
      setSelectedProjectId(project.id);
      await loadWorktrees(project.id, generation.current);
      return project;
    },
    [setProjects, setSelectedProjectId, loadWorktrees],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await api.removeProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setWorktrees((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
        setSelectedWorktree(null);
      }
    },
    [
      setProjects,
      setWorktrees,
      selectedProjectId,
      setSelectedProjectId,
      setSelectedWorktree,
    ],
  );

  return {
    projects,
    loading,
    selectedProjectId,
    selectedWorktree,
    reload,
    addProject,
    removeProject,
  };
}
