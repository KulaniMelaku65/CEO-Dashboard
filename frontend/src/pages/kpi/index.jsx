import KpiDepartment from './KpiDepartment.jsx'
import { KPI_DEPARTMENTS } from './departments.js'

// One page component per department id, all backed by the same KpiDepartment component
// parameterized by departmentId — same factory pattern as procurement/index.jsx — spread
// into App.jsx's PAGE_COMPONENTS map instead of 12 individual imports there.
export const KPI_PAGE_COMPONENTS = Object.fromEntries(
  KPI_DEPARTMENTS.map(dept => [
    dept.id,
    (props) => <KpiDepartment {...props} departmentId={dept.id} />
  ])
)
