import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

export function PeopleOpsFiltersProvider({ children }) {
  const [filterBU,     setFilterBU]     = useState('All')
  const [filterType,   setFilterType]   = useState('All')
  const [filterVC,     setFilterVC]     = useState('All')
  const [filterSource, setFilterSource] = useState('All')
  // filterMonth: 'All', or a specific "Month Year" combo (e.g. "January 2026") — set only
  // when BOTH a month and year are picked.
  const [filterMonth,  setFilterMonth]  = useState('All')
  // filterYear: 'All', or a bare year (e.g. "2026") — set whenever a year is picked, whether
  // or not a specific month is also picked. Consumers that only care about "which year" (not
  // a specific month) should read this instead of trying to parse it out of filterMonth.
  const [filterYear,   setFilterYear]   = useState('All')

  const clearFilters = () => {
    setFilterBU('All')
    setFilterType('All')
    setFilterVC('All')
    setFilterSource('All')
    setFilterMonth('All')
    setFilterYear('All')
  }

  const anyActive = filterBU !== 'All' || filterType !== 'All' || filterVC !== 'All' || filterSource !== 'All' || filterMonth !== 'All' || filterYear !== 'All'

  return (
    <Ctx.Provider value={{
      filterBU, setFilterBU,
      filterType, setFilterType,
      filterVC, setFilterVC,
      filterSource, setFilterSource,
      filterMonth, setFilterMonth,
      filterYear, setFilterYear,
      clearFilters, anyActive
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePeopleOpsFilters = () => useContext(Ctx)
