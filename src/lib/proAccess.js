export const FREE_PROJECT_LIMIT = 5;
export const FREE_TRIANGLE_LIMIT = 50000;
export const PRO_TOOL_IDS = new Set(['boolean', 'subtract', 'union', 'intersect', 'radial_array', 'bridge', 'sculpt']);
export const TRIANGLE_GROWTH_TOOLS = new Set(['divide', 'extrude', 'clone', 'draw_face', 'create_face', 'create_face_border', 'split', 'cut_loop', 'draw_cut', 'add_vertex', 'bevel', 'mirror']);

export const isProUser = (user) => user?.pro_active === true || user?.pro_plan === 'lifetime';
export const totalTriangles = (manager) => manager?.meshes?.reduce((sum, mesh) => sum + (mesh.getTriangleCount?.() || 0), 0) || 0;