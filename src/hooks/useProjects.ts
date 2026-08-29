import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import type { WorktreeStatus } from "../lib/types";
import {
  projectsAtom,
  pullRequestsAtom,
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
export function useProjects() {
  const [projects, setProjects] = useAtom(projectsAtom);
  const [worktrees, setWorktrees] = useAtom(worktreesAtom);
  const setStatuses = useSetAtom(statusesAtom);
  const setPullRequests = useSetAtom(pullRequestsAtom);
  const [projectId, setProjectId] = useAtom(selectedProjectIdAtom);
  const [worktree, setWorktree] = useAtom(selectedWorktreeAtom);
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();

  /** 読み込み中に選択が変わったら古い結果を捨てるための世代番号。 */
  const generation = useRef(0);

  const loadWorktrees = useCallback(
    async (id: string, gen: number) => {
      try {
        const list = await api.listWorktrees(id);
        if (gen !== generation.current) return;
        setWorktrees((prev) => ({ ...prev, [id]: list }));

        const paths = list.map((w) => w.path);
        if (paths.length === 0) return;
        const statuses = await api.worktreeStatuses(id, paths);
        if (gen !== generation.current) return;
        setStatuses((prev) => {
          const next = { ...prev };
          statuses.forEach((s: WorktreeStatus) => {
            next[s.path] = s;
          });
          return next;
        });

        // PR は gh の実行が要るので最後に回す。無い環境では空で返る。
        const prs = await api.pullRequests(id);
        if (gen !== generation.current) return;
        setPullRequests(prs);
      } catch (e) {
        if (gen === generation.current) showError(e);
      }
    },
    [setWorktrees, setStatuses, setPullRequests, showError],
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

  // 選択の穴埋めは reload と分ける。reload が選択に依存すると、選択を直した
  // 瞬間に reload の同一性が変わって再読込が二重に走る。
  useEffect(() => {
    if (projects.length === 0) return;
    if (!projects.some((p) => p.id === projectId)) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId, setProjectId]);

  useEffect(() => {
    if (!projectId) return;
    const list = worktrees[projectId];
    if (!list?.length) return;
    if (!list.some((w) => w.path === worktree)) {
      setWorktree((list.find((w) => w.isMain) ?? list[0]).path);
    }
  }, [worktrees, projectId, worktree, setWorktree]);

  const addProject = useCallback(
    async (path: string) => {
      const project = await api.addProject(path);
      setProjects((prev) => [...prev, project]);
      setProjectId(project.id);
      setWorktree(null);
      await loadWorktrees(project.id, generation.current);
      return project;
    },
    [setProjects, setProjectId, setWorktree, loadWorktrees],
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
      if (projectId === id) {
        setProjectId(null);
        setWorktree(null);
      }
    },
    [setProjects, setWorktrees, projectId, setProjectId, setWorktree],
  );

  const renameProject = useCallback(
    async (id: string, name: string) => {
      const updated = await api.renameProject(id, name);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    },
    [setProjects],
  );

  const reorderProjects = useCallback(
    async (ids: string[]) => {
      // 押した順に見えるよう先に並べ替える。往復を待つと 1 段ずつが鈍い。
      setProjects((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        const next = ids.flatMap((id) => byId.get(id) ?? []);
        return next.length === prev.length ? next : prev;
      });
      await api.reorderProjects(ids);
    },
    [setProjects],
  );

  return {
    projects,
    loading,
    reload,
    addProject,
    removeProject,
    renameProject,
    reorderProjects,
  };
}

/** 選択中プロジェクトの worktree 一覧。 */
export function useCurrentWorktrees() {
  const projectId = useAtomValue(selectedProjectIdAtom);
  const worktrees = useAtomValue(worktreesAtom);
  return projectId ? (worktrees[projectId] ?? []) : [];
}
