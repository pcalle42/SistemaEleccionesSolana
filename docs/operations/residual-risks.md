# Riesgos operativos residuales

- La plataforma productiva y su collector aún no están elegidos. Disco/WAL/locks,
  replica lag, recursos de host y memoria/evictions Valkey requieren el adaptador
  de infraestructura del documento 20.
- SLO, RPO, RTO, retención, frecuencia de restore y threshold de reloj siguen
  siendo gates; requieren requisitos electorales, legales y baseline de staging.
- Los contadores OpenMetrics viven en memoria y reinician con el proceso. El
  backend de métricas futuro debe agregar réplicas y persistir series.
- Los digests detectan corrupción, pero no sustituyen storage cifrado/inmutable,
  IAM ni firma/atestación. Esos controles son obligatorios en producción.
- El offline verifier del restore se ejecuta cuando se entrega un package oficial.
  Un backup sin package solo puede validar invariantes y evidencia de DB.
- Tracing distribuido no se adopta por ahora para evitar correlación. Si el
  diagnóstico futuro lo exige, debe preservar el boundary anónimo definido.
- Faltan el game day de pérdida de artifact store y rollback sobre staging
  efímero; no se simulan alterando el devnet compartido.
