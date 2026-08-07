import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

export function PeopleOpsFiltersProvider({ children }) {
  const [filterBU,     setFilterBU]     = useState('All')
  const [filterType,   setFilterType]   = useState('All')
  const [filterVC,     setFilterVC]     = useState('All')
  const [filterSource, setFilterSource] = useState('All')
  const [filterMonth,  setFilterMonth]  = useState('All')

  const clearFilters = () => {
    setFilterBU('All')
    setFilterType('All')
    setFilterVC('All')
    setFilterSource('All')
    setFilterMonth('All')
  }

  const anyActive = filterBU !== 'All' || filterType !== 'All' || filterVC !== 'All' || filterSource !== 'All' || filterMonth !== 'All'

  return (
    <Ctx.Provider value={{
      filterBU, setFilterBU,
      filterType, setFilterType,
      filterVC, setFilterVC,
      filterSource, setFilterSource,
      filterMonth, setFilterMonth,
      clearFilters, anyActive
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePeopleOpsFilters = () => useContext(Ctx)
