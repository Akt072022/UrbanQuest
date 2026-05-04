// Shared dimension illustrations — imported here once so both the
// journey map (MapView) and the workshop wizard (FacilitatorView)
// render the same artwork. Vite turns each import into a content-
// hashed asset URL at build time.
import iconSpatial      from '../assets/Icon_Spatial.png'
import iconHeritage     from '../assets/Icon_Heritage.png'
import iconSocial       from '../assets/Icon_Social.png'
import iconEco          from '../assets/Icon_Eco.png'
import iconLegislation  from '../assets/Icon_Legislation.png'
import iconEnvironment  from '../assets/Icon_Environment.png'

export const DIM_ICON = {
  spatial:       iconSpatial,
  heritage:      iconHeritage,
  social:        iconSocial,
  economic:      iconEco,
  regulation:    iconLegislation,
  environmental: iconEnvironment,
}
