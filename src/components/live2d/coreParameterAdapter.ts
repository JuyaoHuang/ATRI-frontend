export interface Live2DCoreModel {
  setParameterValueById?: (id: string, value: number) => unknown
  setParamFloat?: (id: string | number, value: number) => unknown
}

const CUBISM2_PARAMETER_IDS: Readonly<Record<string, string>> = {
  ParamAngleX: 'PARAM_ANGLE_X',
  ParamAngleY: 'PARAM_ANGLE_Y',
  ParamAngleZ: 'PARAM_ANGLE_Z',
  ParamEyeLOpen: 'PARAM_EYE_L_OPEN',
  ParamEyeROpen: 'PARAM_EYE_R_OPEN',
  ParamEyeLSmile: 'PARAM_EYE_L_SMILE',
  ParamEyeRSmile: 'PARAM_EYE_R_SMILE',
  ParamEyeBallX: 'PARAM_EYE_BALL_X',
  ParamEyeBallY: 'PARAM_EYE_BALL_Y',
  ParamBrowLX: 'PARAM_BROW_L_X',
  ParamBrowRX: 'PARAM_BROW_R_X',
  ParamBrowLY: 'PARAM_BROW_L_Y',
  ParamBrowRY: 'PARAM_BROW_R_Y',
  ParamBrowLAngle: 'PARAM_BROW_L_ANGLE',
  ParamBrowRAngle: 'PARAM_BROW_R_ANGLE',
  ParamBrowLForm: 'PARAM_BROW_L_FORM',
  ParamBrowRForm: 'PARAM_BROW_R_FORM',
  ParamMouthOpenY: 'PARAM_MOUTH_OPEN_Y',
  ParamMouthForm: 'PARAM_MOUTH_FORM',
  ParamCheek: 'PARAM_CHEEK',
  ParamBodyAngleX: 'PARAM_BODY_ANGLE_X',
  ParamBodyAngleY: 'PARAM_BODY_ANGLE_Y',
  ParamBodyAngleZ: 'PARAM_BODY_ANGLE_Z',
  ParamBreath: 'PARAM_BREATH',
}

export function setLive2dCoreParameter(
  coreModel: Live2DCoreModel | null | undefined,
  parameterId: string,
  value: number,
) {
  if (typeof coreModel?.setParameterValueById === 'function') {
    coreModel.setParameterValueById(parameterId, value)
    return true
  }

  if (typeof coreModel?.setParamFloat === 'function') {
    coreModel.setParamFloat(CUBISM2_PARAMETER_IDS[parameterId] ?? parameterId, value)
    return true
  }

  return false
}
