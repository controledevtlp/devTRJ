/* Robô Tais — roda DENTRO da aba da Tais (Telegram Web ou Portal TIM).
 * Nenhuma senha é lida. Tudo acontece no seu navegador, na sua sessão já logada.
 * Pode ser usado como extensão do Edge, favorito (bookmarklet) ou colado no console (F12). */
(() => {
  'use strict';
  if (window.__roboTais) { window.__roboTais.mostrar(); return; }

  const VERSAO = '2.0';
  const LOGO_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAABwCAYAAADG4PRLAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAABMI0lEQVR42rW9d5hdV3X3/1n7nHunqxdbtmRZlptsy71hjLENphswoXcImNAMDnkhkIS8tEB4gSQ0AzEltBAIL6ZjYwy4yQX3IkuyZPU+RVNuO2ev94+9zz773BkZwy+/eR4joZm595699urf9V0yb94cjAgighEBwJgEEUFEsVYxxiACIgZjBFUQEUABQVUxxv1unltUFfelgMFaCygiYK0iIlirZHmGEcGqIoBVBQUxIqia3FpBNUdE1b0pqoqqzlP0GLW6XJVTED3SICsUVK09DmQIcR9OVUFV/Qcex7LWgghsVHSTqt4DPAasAxlWtf6zC6CiSgKoqrUg7oMWjxf+ItEzl19P9N9m+nqiPydz587GiJAmCRgBC8aYIBCrFiMJIuWLOoEZksTgzgfARoItP0Se2/CgheBAya0TtBEht9ZfHjGq1iAmU7WotcURLVXViyy6WpRzBVaqyEKrirU5KOFi4T+PGPxnKz6XUpxJfDbumQTQvapsAL0VuE9VfiPCVi1e1D1BClh312y4oDMdenFnDiaI/ylByvx5c5z2GYPgtMxpi9M6J0xDlueotYB4bXR/ggl/z/Pcn57T6EIbnfBBjGCtdZcCQcSQdTpi1ZokTVUUqwLWWiNwjqpegnKJCqdY1T5Vi6hg8YqgalXDI4ooKGpQ8QJU919x+dz3rToroE5zEMT9DvifB1BpgN4DXAtcq6prRLBO79SgIl6YxbVgprP+/12ACxfMc2az0Bx/+IUeGWP8A0UvJBK0w4iQJEkwjyBYm3thgkncDc3yDMH45/W/KZgsz/PifVA9zqo+V3P7ahVWG5Fw9621uT8lyVWNgiTFqwmoxZvhHCFB8Zen+BktDthrhtXw2lp8A7HBL6BJeTMEVXufKt9E+KnA2uhIEvfuKP7UurQ2vG946T9BQOpu3cEFuGD+XMQYd7TuXJ0m4m6xePsuXrAKqLVYa0mSxB28v31OiJBrjqhgjPNvTnMJJkWVRNHcv2aSZ/lFYuTtau0zFHqcFqgKkouIqKqxqoU/wzrdcSbZa5lgUM1RwSkU1qu9e35rLajTeidcS/Gkzi9PO0x1GiaqqomqFff5aQG/Aj4H/AYhdwcnCZCXh15oMsFqxTHDE9XAPyZsmT93NmIMqUncwxb+3muPtTmqTsv8FUe9qTFGvAB9AGOd4JDC3zlz6V5PnOlxP22tah14FVavUHR1bp1ZVTQDMc5Mqb+3imjhfIqD957LX0+1eMF4lfTxhvtcNgRKIgYt1BUJalT4QmdFoHTlgg9srNNQTUvN5D7gX1X5FtBWVeMvqf1TBfFEBDrTzyQDA/2lmfS+EB9YiNcsY6KH9tFokiT+2U3wN+4ICQdcGAxjElE0QbHGiKrqywW+BbzJqi5WVU1MYgFRNBERMThfR3g9dwnEH66qYlUxYvC+L7wvouE31RamVLy8vCa6pyP4Pv/75SFJl9kTATXOd/rHhEMQfb6IeaGqjopwP4iKkBzML3YHed3/NtP3YsF1/6zBm0TvisIvFJqV1lIXzCQGtRoOsQhOQLF5Hjl/H6z4Q0uSJFFVFZE8MeYcHxR8B5ETgVyMscaFvImqOu9bnGvki90Re+3z3sZlG4WllMinUQQsUZDlPo/4/++zhKCIgnGvK+IDOSJBRr7TfcTEf1ALkgMnish3QK4FzvGmVJ1/JLif7sOfSXDx9x5PsEED+3p7KXKsxBhnQqR8cWMSEpMgOJOYpsanDIoxSVcaUfol57tsIiK5orMFPgl8XlWPFhGr1qoqiXN1Qm7zYMZ9rIgAebgYihgz7QEVn9VJaRGLnNaZVbq0iuAinJkt/TvejxcCdH/vPmiNXscILhOy7m10pYi8FmQhcAtIQ0SS8kNPD2IeT4h/TJhOgH09XttwkZnaMqkOzt+ZnvJFfDDgD1eMO7ni38TnIs5cyjMEfpjn9tmqNrFWc1WbuHOW4GOSJEHFaZXNvekREGNCvliYzfjBfNoRHUyZvzppahRJu1RXC40CEBOiRC18n9rgBGPTHIQZBYbenIt/nFwhFeRs4DJjZD3Iev9ZjdeUgwrpz/lK+vt68ckQYgTx+WBsPBDKxD63wQ864foIrnhIY1JjklxEUhHzKWvzzwHzRcisC/+N+MTQpQlF3miqApLys4g/2dxakiISJv6fMlSX7iKJMcG4Ck7givXBllfbwnN74djItLrINQ5qqGhnbGIBf1PIgIUgrwLmANeD5iDpwQIc9ZftYAI+2JcJ1QkpX0iLG+EPtjgAa23h870/wUeaTnOMkUQgA3u0tfa3eZ69SwQrRqwkSSoqlXQEHyC5cpotMyn1ztmnH8ZHtIkPsMoigj9jjSVWitH4lEi9xRATmV6Jf08quZsxVZNaqbCUQU1FmM5fBxOf4syqFZF3ifBbkKOBTESSg/nEIIQ/VQND2Sd8NOdDgvkyhizLgnbEd84kiddgEuey5CWq9kfW6rGJSTIRSdSq2NyWUaNxiXQZpIgPUopQX6L3Kr7nJOUCqShIKSQuUka/RSoeoiH/u2orftAJ304LluIUhK7yYHnIXRGklhrpXXKhoxnIcuCVqvqYiDzgAzb9c01o/LNJb09PmbzHyXpRxfDVlSIpT5MEkxgymzutc4l2gpCLmMtV7TeAPmNMrqqpEvLpIPnyvaoHked58MfWa58rnxWRojPzRb5aVFdEilRDg1CrJpYQmEm3IKSiRkUJA6Us2kdWvZIaiFRrq3GyHl1zo0oODIjwYpBdoHcUEeqfI8QuAdaCmQpRXsj9NDxXoYlWLXluSUzinRkGNEe4CuQfRUzuQ+6kKFkV0YMXeOhulAGH832JcalK7i9HkZvGbqPMv0tzV4SfZVBl/DPgfZ0pI2uJczyKpkXIE8M18GpcdF1KfSlNuAZ/IhXtK4WoRZBtfGRkgUtBDgV+0i3EP1r3LBQsqowlPT11V0oTiQPtsgZX+feyHZS4ENOoag58WeDNIpJbaxOX17lOhDG+Vko1knVdDv9hfLBS+CHjw3jjo1sbukH+uvuqjBFXaDcEH+wshOtruIK5EYyPbhEn0CC+8GwSlR8KGWslcClvvalYjXAnutLrInotBVtcdnLgTBE5TER+PJMmPlEtVFXSogtho8JvYoqIMsqbRMizvBCGWGtNkiS5tfbLwJtUtaNqa3HloIhcVW0IjMJDa+ICF0CtM52FwF3xm0rryhDlfapo5sp0WSenneWomq6+nEaKUAYoSWJIEyFJkxB/li2nLuGqqbxeyAQqWlMtuxVtEfdKrj5b0XiRxKrtCPIm/0tv9kKM+m4ctIDdXZVJw82yNrSVQiVGIg1Q9f0/FYXEmCRT1S8r+iYgS0xSU7XOzNoyqXc5oi0FER2StdZXeJyZdO0mDfmaKxy4Yn+WZXRyS7udYUno7etl3ux+FswZ5JD5Q8wdrDOrv05vPfXJuWsut9o5jXabAxNN9h9osHdknP0HGowcaNBpd5xgjKG3nrqeolXyyKOW5rKqiWo1XPA4kq3EO0X5sShom8IKUUPJgDf5C/9m0DRUcPSJ+T8AmTN7yGudiTTQBDOaJAab29jMpsaYzFp7lbX55SKmA+KEl5gyZvAxmGtkFx1/E8xTntkoLPfBkvg802tvu9Om0Wyh1jBr9iyOWLKQE1cs4sQV8zls3gB9aQZ5xt7RA+wdbbBnpMn+iQaTjQ5TjSaqLi3rSQ39vTX6ehMG++r0pIYMw+hEm617x9m44wBb9xwg67QxxlCv+8qTlsFSXMRwQjChfxgK5JEWlrVMyoZy8e8aLEUHqAFfAt4CpKqa/UmmdPaswTI668pNEmMqJlQgFZFMVS8XI1ep1UxE0uIDuwK3swTGBxJOgHi/5h44McZ14Y2/yT6hz7OcxBharSbNZoe5c+dx0nHLuOTsFZy+ch5DtTa7945y7/o9/GHdHh7aMsLWfROMHGj8yT5k7mCdw+YPctSS2SxZOEiaJuwa63D3ut1s2D4M1lKvpSRGyG2pjWUHv9S8WENjKElxFvGZWjutlZQBqRfgl1S1OOMnJsA5s4cqUaiJblP8xiKSOJ+nf2Ft/n0RKZJScXCGGG7hzYkFk/hWlNoo0rRBmGlS+vB2c5I8sxx79BE896kn85xzjmDxXOGR9Vv58e/X86s7t/LgYyO02u1qyFBEuMYXoqXME8uL6eMfq+RWQ/E+CHSgxokrFnLi8vnMGurl3o37uen+nUxMNkiShFrNYG2ULZZQjK4KKdXORhQ1olVYio+KFSVX1RR4MfADVQ29xT+OiZk9FGtYKGAXzt8HH8Y4YNGRqvbOxKSzfePIlE1aJxyXpFtE1QnPR4n4ToIYQyLqD1xdWb/TItGcVSccxV9ceiHPetIStDXBf//qXr7y43u4+f4dZJ1O+NBpatx7hWozlXplHMx052oaAWOKYoFa6GSl5Tp8fh8Xn3o4xy1fyINbx/jJLRsZG29Qr9ecb7VlM7gUoE7/txnAT2Xz25+bu2mF/R0DzgA2ufoq9o/1BmX27EFv3lyw4XI0482eOxlr1fjk+2aQs0HzNE2SMljxmZQ3hcaVIF13ARcACVBLhVpiqBmlp55S1zaz04xVq47m2c9/NudfeCz5yC6+/O0b+ex3b+HhTbvDc9dTbx18LlkESMX7hpse8nel+/iKwyvMetHyKropBlesaLWdMGf1Jlz6pOWctepQ7twwxrd//TB5ltHXWyfLbVfLSUPcINNCSQl+sEjDtNJIdn1nX6G5TUTO0+JDHSQeDQIsTGhcnyuqnyIgRhJrNRf4jIi8q7DZLgJTX3aLCh4iGFFqiXHaZSAVqKVQS4QUGOpJWdzX4azVy3nycy7j1IvOAcb5r6//kg//y3/zwKZdAPTUBCOJ8yjGOBPvzXyczBfVkrjRW1Rvip/Jfd9LVFEpDzoRod3JaHfyikDqtcT/mzKrL+V1zziO1ccs4Zu/Xsfv7nqMWi0hTQxZrlG1RmdIL2SGxu7MACgg86b0X4B3e4Hmj6+Bswa9D3TJZ1K0XlwQk7imq1yM8mtrbSbGBS0FLFSMwWgJsUgSQ80YUgOpgZqBnhRqxtBfNwzW4JhD6jzn0mfx5Je9GZl9KA/+/kf83Qc+x09uegAB+vpSpykiiKQBHSc+HyzqppRlUbDus1tVLLaslaqDurnnzUOzODWGTrtDq5Mza/ZsTjlmMSctG0KzDtfdtZ3120aopQ6b2MmcIhy/dDZXvuxM9kzmfPRrtzDVaDHQV6ed2xBFhzJd0W8MwCwNDQvUojP0F71QMh/IPA24/mD+sCJAiV/GN3a9dTGJMf3W6t2KrjBiFNQUwUKR95myc0MtMRhRepOEgZ6UntQyqy4M1BP60oyjF9Z58V9dwTHPeDPa2c9VH/0I//zpr7FnPKN/ICUDrBrnhwPmJupXUtZFlVLbisArbuDGQYRrE1nvO2Fissn8+XN53aWn8dqLj2SWTHHtzRvYumuU0449lHd/7W627J0gTRKfRimdjnuPt73wZF74zNP528/dwB33b3JC9JWHrhL1tEawK0SUJTi6fTMe9KOyUVVPBaYOZkpVlaS3px5V9iWulvhuOp9W9BkCVowkSZpUuplxYdoYSEVIROnvMczqFeb2wqKBOkfMsZy16jAuu+IfWX7+K9jxyG2897Vv4Etf/RmdVOnrq2HFgBjSWt2jw42HJUqIJIvPZ712mSDQmcsjoYuhSpom2CxjqtHhpZdewJf+7hm89qJDWb9uM6/96K/5yq838vuH93PSEbMZ6qtzz8b91NIE9Tlh4iP12x7ayYbNe/mX9/8FUu/ltrsfpadeK6p8XTXXshNftpDkoAm6l4IF5gOzgJ/5So3O9DtpkUiHYrbzFcaXG0+31l5uRHLfWyLPra90mLJaYUyIMo0IvTVDbwIDqeWI+QOcfEQvp51zJsc85130LV7FXb+8mg+++33c+9gYvfPqdDIlx1BLUqzrHqMBwOuL0d7sFOay7C6IL4WVBYyiDVZULq1CWktpTjXoH5zDpz74Gl55/iC1qd189fvruOLztzDRzEgTQ26VuYsX0NiysdQbgYQEKzbkh7fcv43nv/VL/Nfn38lRyw/nb//pm/T21hzwuGh5+WJdCfLS7oC0EjWLhC6JAXIRuVxVvwbc5cA9art7hqZoqeWqroVTgkDUWvspIyb14a6o4gFMAezqDtB/YAcQsfSmwlCPsHCol1OX93Lpq1/Bya/9N/oWn8xvv/ERPnD5X/Ho7gPUBnuwVpAkpVbvwaQ1TJpiTBKQ4nGEJ1EXtyj6Wy+8sparZfXEl+uS1DA5PsURR6zgp1e/n1ecXePAtg1cfc3DXP7pG0vh5ZZ584Y48Yi53PPo/uqsh+8RGuOEXEtT9oxM8rRXfYKTjz+Cr3zqnTSbHW8RdFqJLXyuqNwZt+6mYyBcxiQinypfaOayeUBY+/A2yfM8z3P7YuACqzbHNWVd8Tm0V2w04OLyuVSEWgJpIgzVayydnXH6U85n/nnvhmSIm67+Wz7/oQ+xr1PDpjUXByYGk9YQk5Q5m28pFXgV94Al0jpYCkrIvMPUiDu7SJhJmjIx0eDUk0/m/37+baxIH2H3ti3ccO8If/PlW8k8KqnoIb70ohPYs2+CdTvGPRJgev8v9EbThFyVZ7/mIyxZNI+vfvpdNFqd4GcL8EeMHpBKnqgVH9hVfSmClwt8gp/HnYvi502oulDJgHtE+Kj4VL348CZKMQLWMqpMGKMkxkV4ZJOsOulUjrn0vWCE679wJf/+6Y+zq1OnhUFNiqQ1JKkFH4NvI+VqUV8vLEpP1mrw/WVwYgOM0WFntJK5p2lCa2qKs08/me9/9m3MbTzMzu17eODRMd792d/SzFzu55HGDA4N8ppLjuGrv3q4qxsTN56pFP0Tn9o859X/yJFLZvHJ972MZrPjzkCKfmZ3QCNPsAeoBcL1o0DPTNh8o0VD1VrUWoOIFXiZwtEKOdajqYtkuYCNB5PrDisxlC2UdoNFiw/hoje+jfrQIN//+Dv59Mc+w7qJHg5kQkYK4hCFJkmdAK2bWHIAMxMePM7tNNcA9sWXokylRCUBxp/WajQmp1h9/HF899/eSe+Be9ixYy9TrYQPXL2G/ZNtV6jHBzdWed/rLmTPvjF+cfuWoH0B5hjpEF0VqwJD89zXf4JnP/VE3viiJ9NodUiTkFFH2FbtgiYebIKpwPtJDhwNvMxHoybO2434OSwfhVqUVJX3qqqqteIcsjtJa20o6obykYqvnxYtnA69vQO87X1vZ8HyPr718ffysY99hW15ymjT0taEDNcNUHH+RMSAIYK1y4x/BtNhoxlEibsfLhetpQlZq8Gxy5fxnav+lvl2A7t3DwOGT373LtZuH/MYWEstTWi3M848+Vhe96wTeO9VN1Zf119KqSC1o2au/2xpmjDZaPEXb/s8733Nkzj12CU0mh1fdFDXIxQTxt8ed2Kl2tUo3vi9vuhtKya0hAS4YR9FL0A4zhijghjxt8v60TFBIrPm+nS5b4gi0Gzk/OWbX8yqc5bx83//Ie/7h69yIE2Z6BiamtBWQ64G682mRchVfKHYRZ46zSdINxIi8sXucFwk7cy30ZyFs4f4yuc/yIoFI+zYvpu+Wso1t2zjJ3ds9prn2l+C0t8/yNUffimf+uaNPLx5f5h7dM9O7MCiy1T2PAtzWq+lPPzoTv73F3/JZ664mN6empsXoYRfxLiayjPKQQVaQACO8/5QY19opqmv6pUoYq1VlcK8RrMGWkR6ZeW96KSPjE7wwhdcwkuedxT3/PJm3vq+L9NKDE0LTSt0NCHXhEyFzEJmXV8wzzJymzvzKILNbUB8q0eThfqmlCkxET5GUBIj1GtCLx0+889/x9mrh9i9dRt99Rprt4zz2R/e5Yrt/uDraUq7Y/niR97Ipq17+Mx3byZNTJhWMgH8GZV84sS76o3IfQP627+8j4c37uKdl51MFvU9S4FVm78yQwe+K6gpbO6V3cGO8cm4UdXcqh5tVS/0kDdTItNsNFRiwRZ4UA0DoFONBitWHsWVrzqF/Tv281cf+BbbRxqYVMisgKRYTcis669Zdf9lVr3WCdZSorJ9pKvRwIP1sMJKk9hDQOqJ0N9TQxoT/M2Vb+X5LzqX0R2bSIF2x/CRr93CgWYWwFK99RqNZpu3v/GFnHPyMl7z3m+E6DIk3GHsPMKNSjknIZW+oK0UNv7x6pt58jELOHbpPDpZ7uvFMq0FVVZvHheRVmjhhd4f5oUvND4gMX727vmC9CHkRUZprQXjUNFZnnvEdDkEmucWa3Os6eF/veGpHNI/wd//n1+w5qGtDPUldKxBTQ2LcbmmL39ZH7C4W17CMAKKLW7UaFz1ieC76rSulgi9PXWS1gFe/Lyn8Y7/dTmtfZvIs5zewQG+/IM13PnoXpLERa499ZSpRpunP/VsPnjFi7j0TZ9ibKIRdc9LUHAJSQTnZaI2VhTchHkMHLBq98gUP7x1I298+tEuX7XVoU8RcYi5JzZGJl5ofcDz48EkH+uaXETqqvq6skdqgn0vnHbi8684vE8Sw/hkk2deeCrPO6WfH13/CP9+zR301gxtK6hJsIjTNBVfMHBNVSt4X+iEFJDfPpWogG0r065lFJoY6K8n9Eub81av4IOf/BhkI7QbDWYN9HPbHzbxhR/dHZ6jp16j2eyw+oTj+I/PvZeXvuXjPLJxh/OLWhA6SKVwIOV5Vc1pBEwuf8ePIiSG//rdJnokZ/UR81wFaxo+/0+aEyw+wOuAelHgNqqaeBz0Gap6gnVxuAm2NlQ1JGiItTZM8eRZzsKFC3nrpceyf/gAf/+lW+l40oJQ99NymNLm6jXRTw8VI0SUmEcbvV/u5y8clFCDdjiUmpIaoT8VVi0U3v+RjzLv8Hl0xofpqbmL9eHP/YLJDq7FlSY0mx2WLV3CT/7zM7zr/f/Kb255wKURaj1MkWBhYiSyRCbdxok4GgQRyydNhKlWh+vu281zTz/UV4W0gnIrxuKe4CSS8RHoCb7p6+BLxdSsql5CwadhrfNLNpoz95AIG41jGREmmxmXXXwCpx+W8JWfreOBjbvoSQ1WBElMOYfg4jZyteRRCawy8hU57zhVsD7NMZVCMSQC/fWURT1N3nnluzn+/IvJRvdhUOp9vXzru9dx4yPOdKZpQquVccjiRVx7zdf40D99ge/9+HfU0sQFYWG4NfRBo6k1iXLAcljUxFD+ynOIA/Qa4bcP7mawv8aKxUP+4ks0r08FbvkEvoou8iWRpZQ8RxNULxEfJ4svSZUg3Gp9UX15Kcsy5i+YyysuOoJNO0b4wn//wT+8ITHOX1jwDVSc2bQFONdrWBgO1VDSC3CHqMseML3etBrj8DT9tHjexWdz/svfim0eQG2HtK+fRx98jH/+xo2ICD21lGYr45DFC/j5NV/nXz57NVd/5yektZQst75uYErknEcoiI+KNSpDShdCvMRyW0qIizurWpowMdXmvs0jnL1y9kFMpP4pM/PihX1JUWozqlhRFglyqjqsionh7hqN4BRVfvWto/GpDpecvYITF8M3rtvAzn3j1DxIyfHIJH4kTQODhYjxplNDJJv7CWEt8ksvyNxHv5XUzxcPEjHUjOXQ2QkvuvxvkJrBtieRtBfabT726W+yfbRNX0/KVLPD0sMO5Vc/+y++cNU3uOpr/0WtlmLz3AOinOk0hfZpwKa7Ar3PvssGVVkNKrqVJrIgBsVIaRLXrBvm0Dm9DPakftaxC+QcF0vj1z+4HzwVWARYI25O7+kq9AqSq58wr5R4iv6bLcNnay1Dswb5i/OWsH3PON++br0vNEsYqHSaJWFeIZhJn18STcYWbBeVwdIZ0chJqLiY1gSXveRlLDv1OLLxHWCbpHXh2h/+lG9eu5a+nhpTzQ6rjjuaX/z02/zTJ/6Vr3z9e9RqKVmee+YpE6HZJLQ61Be5i4K9MfHIXYxYL2rEhG5FmiSkSUIiQl89ZcdIg53DTRbPqqGqZLm7sO4/93dfyixDpgj7M0M02gs8HV+aIVd7iiv5iBboKqu2HC8ruVJQhERgstHmvNMO59Sldf77xm1s2TVCmobR49DKKQiD8jwPKHdPIlFJiG1edjcKRooA+ZeS58WIRWoJYjscvfIIXvzaF2JHN2PbHdLeAQ48+gh/9+nvYk1Co9XhgiefzVWf/RBXvvd/84trf0ctTR3FVzQzUfi8YCC1BCjFXRwpwLsxsMpjXgtuHJvnNPPpWcB3bt1BUqvR1z9AT09KvZ6Q+LAky3M6WU6rldFsdQLssvs13KhIuM6nAP+RqmoNeJJFMaoGkQrvS4z4opg2SoVOplx0yhIky/jB7zd6DE3itc9dgzCBW7BFRLN08fSXSBWep5EWhnl21aJZgVHQrMMVV7yGOYNTNPbvcdqU93DV57/FnY+OAfDqlz6bv33Pm3jVG97NH+5+iFotJc8deDgMi1ZGy6pdB41aU4ALyrx5zW1Ou52HY+4RmDdniMWLF3DoYYtYfth8li4aYOHsOvN6Ewb7U5IkwarSaGVMtWB0YopGs8PEVJuJZpvGVJOpRouJqRajByYYHmuwb3SSkfEmE41OgYQrzOiTgFqqyqAIK3FoLaFi2ooCrEYUWtDuZMydO8BZy3u5f+Mwax7eVQ6IRlQlhYO3gQutklH49o8fvOqaqajC2Qld/zRNmJyY4OWXPoVnnr+SiZ3b0DynXk+469YH+fg3fgfAJ/7hcp7ypJN5+vP+ku279pPWUnKblag27/vKvK5kcCqwKiaQ+1myLKfZyoMr6h8c4ISjFnHKCUdyzpmnctbZp3PssUcxqz5BdmAbu7duZd3Dj7J2/RZ+e9ceHts5ytbd4+wfbzE22aLRyujMgPqsp4aeWkJvPaGvntJbT1kyb4A8VyaaHUYnWzLVygBWqupgKmJWgh3yLAsi0jVaFqUOTguEdsuyauUcjphf5z9+vY1Wu0OtlpY4lGj+PXClRcQ6hfCKYAWp+rwKq5MtTLmD4tssZ/HCubzrzZfQHN5Os5FjO01aWZu//sSPaNDHT65+G42O5YLnvYN2J/ftotwJRAxJhOB2VGkRvsi4AAmUdqdDu2OBhL6hQU48aj6nH3cY551yOE86ZTknnHgkDM1hqtHHQ4/u41tf/xZr1vyB+x7YwPqte5hq2yc8qFmcWzuztDPLeKMz7ed7am4yzAtqSERWpsAxiNQj8hrna4rgJab48yYny5VVy2YhuXLrw8MVrrViSDQeVyPqqwWutUgTlbi+SRddZeknjTFMHJjiQ1dexsoFhr37RmhPHKBeq/Hl769h54Gc33/1L/n5zQ/xj5/7WRgnK5N0LxwJhWDv7ooKjAP1NtptIGHx4oWcfvxhnH/iITzphEM4YkGdegJbhif53e0P84mv/oa1G3fz6MbtDE9NP/DElIj3wkHkuVaQ5AdtJBVDo1oi7VoldlV9NeaY1GJXGeevNC/mxdULIPJBReDhYAoJxyzqZ89wg4e3joTXNFKFOhTz8xWEmO+cq0g5tx75WpcD2rLz7y9DPUmYnGhy4bkn8KInL2P7Y5tptjPIMh54bCsP3LOBj7zuDD78hV/xkxsfKaCR4XIlJmZkLKJhh2PNOh3GJ92AzLLDD+Wic47j6Wcs48Sl/QzUDTt27OS3a+7llrXD3L9xP8NjkyyY3ceSBbMZG5tkeKpDPTUBmR5SsCJh99PCea4cd/hcdg1PMjrVIUKGHEQjp1ukUlkVYFUqykqvaZ6AkUrLo9sXqUJvPeWQoYT128fYMzYVUXXNgIks/FkkSEuB5VRfoio1z/oGb0kY5yZtrbUMDfXxvjc8mXximKmpJlMTkzRb8Kvr7qFeT3jXF29j+95x0iRxOaQp/VgsvKKD0mg0mMwsi+bN4nnPOp8XP+ssTjtygPGxEdbctY6Pfe12/vDIXh7bOc6K5Ys5adkAb3vBSZy0cjFbdhzgzvsf44eb9wZSBts1YuYK3zEgK2fh7D7qBka3jLjotZLQy7QR8oOY3OIvK1PQ4yrUJT5RlxhMXLBLCLQ7ObMGUxYMGG5bO44qJEnUdvGmCdFQpJbQwLQxo0rEKqFB08r31VDvTVLDgYkGf3f5Mzl6fsLuvcO0m20McNPtG/nlg/vYPJo5Hhkj5GoxScnYVAivCK4mJxsgcNpJx3PZCy7mvLNPoDm6g9/eeBcf/tRd3Ld+l++KuK9P/v0beM9bnkF75yM0Owmf/dLPuGnN/dywYZJWZgNVUzmgLmULIyAF3euNNjMWz+2DLSNU59LEaWTMrPHHv45LFRoxc4P1JDgqLoczWmVHsVYZ6knpSZSNuyeCidKIhM6BEKWMXmP8R2FCbUkFEnLGKH4vTLbrNTZ50ilH8fILj2HXzh20M0vezlj/2D4+//OH2DHW9gKSEBiFgrdn2BDcDIRJEp509mk86+IzWLBgDn+492H+/WvfY+PWvdVosJ7Sbme88eXP4T3veBYjGx4hazb5ynd/z12338uD+wjCc89Udu9jntOAQ/OCGm+0OfGwwe6pm+k1VVMyaTxOma2RCqwKvG+iYKuo4qJGKR4pZhX6exLarTa7x9plWyQixrFeSL62WuGhMRHJTzHdWtAha1RoFP87ubX09vTy1698MlP7tjLZsjSbLTqtnK9eu5YdY20SU6DaygqGwdNGS9mGWnnUMs4762RqBr73w19x39rNEUCpTBmMGNrtjFXHruAzH34dk3t2YGyDPzywnXX3PsD2Vo2t+0YjJo3oc1OmUyUnQymAZjtnqL8eAr3HAaT9ccAMrEoVhnyoLiXYVKutlECy6z5QasBmlrHJtv+QHo8ZNK+LrkNLErqIJzdA0YsczHd4QxHZGGFyssUVr7qQZYNt9u+doAjEfnzzJm5eN+xZniLYo5FQCSomg/MsZ+nSJcyZPcR/X3Mdw2MTpdASCTVY9RRRAvT19vLVf30PQ71TjO0eZmSsxfXX3sRklnLHpuGSc02ICOMPMhtYDnTQyS31VKgJdNSV6Bydl7dF3VNMjy/AoVTxyV9ELyKIn/CJOFGiUDg1QpZbxpvtYCTEByemO5rRCBvpQ/bCWRej1sQUk1oClCYmm5yz+kguO/MQdm3bAaZOlnV4eMsY37lxU4nZNkVwkkSUIiWdiSTClm07WP/o5oAgc6lLYbrdGJzBUEsSppptPvbet3P2uSsYXns3PQnc8Pv7ODA8xo0bp3xhIurfBZ9XpUee6fgzq/T31OitCZ22enZhor5pVU7xiMUMplTTmCBFozKS8T0t10iNaFy9j2q1M9qdwGiNxZmtQtOsRrSVYkJlUSMaDsdMQWX0uPCjWW4ZHOjlnS86g8l9u2lnQqvTYGyyw5euXcdkO6/43sQkJFKyK0gxyh0650q9nlagDY7LwU9XqesZNpptTlu9iivf+iymdmymbuDhR3ax/oH1rBuB3aNTPmjRso4a8cEQqFBi9qjAyO5QBKl4KpfH0a8nOCKfeirkmA2D3BJwjEUBWyIzNdXqkFmp0k9G71uwOJii61BSl1OEuAW5XTlJXE7LJmKYbLe44uXnM1vHGTnQptVpoSR88/pH2bx3MgCQTMx+0X1bIxRYSCPII34mlwsadRhoR2tS49MfeTs9dhdjk8NI3ube2x5gbKrNmkfHItxMKbyYQqwgpdVpg5zuh2omARvT086Q81G6mjiNmwkEbFSdQdOK9pc8ZQVioAwqLY2WxSQJaRLfmCpXmcQfXq27gQWI2KpnzjV0L89IRJhstHjW+Sdw/lED7Nq5l/FGg07H8uPbd3DLhn1hR0SxuyLxKY5jfCoDJy3ULEpfwqCou41hYLSWpjTbGa995Qu44IKVjO/ZS402D9z3KGN7dnDzY1M0253S3JoKOyHSFVZWc/Ly3+s1QyJ2ht/gccfODhbqpCaiSsDPH7iirnhlKXxgQYMFk62MVienr55EZTZQTAT9iZjbK/NUVRK6WNCJMTQaLY464lBeeeGxbH9sHR2tkRjlgS1T/OKeHa4R65eoGG+WcnXmNNeS7VCMH1RFcTdNAyG7aolRt54SpZNlLF44n394z0vJRnYgmjM11WHTQ2vZNGK597Gx8uIE7dNoRjOG33dZwahpO2ugh7pxzPvTqZ4Oviwk7g5F35dUYRx0yJF5qyOW9R+n4BpTD2JSdQHAWCNnZMoyZ6BO7H/jNLYYzZAwDGNLRS0e14ePSeJSiayTMzA4wLteei4jm9cz0bTUe3K27pjiC9dtmN6eFqjVU3p6exBx00mq0OpkWIV2ljlgrc2JCcyL+fYiEEmNYbzZ5sp3vI6lRy1kfMN2xLbYvH4LeWOSn903HFh8pYuvtPgc2l3dDECt6jzKgjn9CNDJdUalO1jOFxsrRxCpAoynYB9C5exiJF1j+nBPPxyiS3FNxUY7Y2yiyYLZ9VjXo86D+PUEHpEq5WsmnnhVrSWzOe1OPC9uuOJ1F5CObmV4skmHhN07xtg8lfCm1zyL4489hqVHrGDJoYeyYP4AAz1CTy3HtIZpHdjDxMh+RvftZ3h0isZUixHfSxs+0GLPWIOdw5PsHWmwa2SKfWNTTE61/GN2OPqoI3jrG55JZ3gXaSocGMkY2fwod+1osmnXuMs1vUWW4Ainz6OUEbt2wUHc3w6dP0Sz2aSVK9MIZqYPt3RRowRNLr75UKpKX5XL01bztC4zWqCmtw63WNBXq+h4IGstKDikHHQzRsjynEaj7c2HYWBoFkeuWMgxy+ZzzJIhTj59NXsfvINNW/bS09ODzVqcfvIRfOYtL4P5h9No9LFjX4et23Zz25q17Ni2ne07d7N39y5GR0eZmJik0Wy6SDPPqRnXOuqv1+jrMQz01znk8AHOWDGHtlX2T+Xs3DvB/Rt28d53voTBgQmmdo1QS2Bs9x6arSm+f+ueMl0R57vjGf1u5t4QNGFQn0CLlmHeYQt6aQyPMpP8KnmyThdelcJLUNW+VMSsVWW1ROx+1ZU0UtYyCcAPHtw+wdNPXOBAuNYGDpei/pl4E5VlGc22y757B2Zz0solnHPyEZxx9HxOOHIOS+bUaOzdgenv446H17F90yYkcbD30bxOPlLj+W+5mkce3c72XSNMNFv8T3ylBubP6mPOYA9nnbSCl150OI1tj2EMjB2YxA5v5Yb1DXbsc9qnEEpy+HhMVCJUQWXqr+zQFG253NLXX2f5gj7u35aFQdFu+hFh5j0R01kSFWBtCmxwyXX3JIWvDoTtKRJ8WGLg0T1TvKA3Zai3xnirQ5L6HCdx+ddUwx300Oy5XPjk43nWU47j3OMXMq8vZ//e/Ty4bgvf/+kD3PnQdo5cvoynnLyMO2+8g97+OoN14boHx7htw37gkWlRWZUwVivFb2ak36kaJlXIrGX3aIPdow2ufNNzqE3sZryT0NNfZ3zrZvaNTvHdm3ZE+V15mfG1T5WyBhq0USpD4cHsZdaycsl8lg4m/GKk0RXuHDwKPVgC7//ckKrqQ1JyFgdUdNh+4vuD6oMSrKMSGZ1ssedAmyMW9vPQtgPUUkOz1aHZgrTWwyUXnsuLLjmds46fj8mb3PvwJv7tG7ez5r5tPLrjQOjAL122hFesPoJN991NX18PvfWENZumuG3D/lAai1tb6qsrxbqImFk+ZkqKCWI1qgkWZ1GrJXQ6OWedvILnnTqX7Zu2UuvtYSrtoza1n5/eO8LOPQeoJW6mo6i4dLNMSBdLWqiP2nIbjAfcsXrFfGraZMtIpwqvLxaPUHJ4/5FEvnjDh1JV1oG2gVq8PCOYhqigXcS+xejxQ9vHOfXIuTywdYzJRofDlhzKKy59Ms956kn0Jm1uvuNBrvjQT7n1vi2eLKcsHAOsPuEo3v+Ks1l/5xoyhEVze1izpcWv79sVFkPaPJ4WKskBippl+bBS8SFmRtMjJae2Zwp+y2Vn0ti/i6m2kh0YRzSn2WzxH9dvCoSw8fuG1QVWKwl7VM4KLPblSVvqacK5xy+i0Rpl23A7QpjG5TSdsaQ2Q2ohQBtYl4qwARgHmR8YzqPczu0w8niYkDlBTz3l9nV7eOGZh3DMUct488ufxtmrD+eBhzbwvz/9TW64fX0XvMCdeJII7XbO6hNX8nevOp+dD96OiOHQeT3ctKnBNbdt8aZbps0KiImLxiW8ryhESxdtskaVkti3JMbQbLU585QVnHpojW3b91Dr7aGV58xJO/zgdqd9xSYbYyQCZWlpkaJpZelCwMf12KyTsWLZYs46cjbX37SVA42283+ED1ktAuDaeTO2kwKcgXFgQwoyIegGhfkRI005jRvD7KybRsqyjE5mOfzII3jupRfw8ln9/OLmtXzic99l72ijwipYDGlaXwRvt3OedPZq/u4VZ7LjvttBlKWHzuGnD4zxg5s2lbFd4BiNx5lNtcIRQLcSSBGKpZQF232VysPDln2p7yXnr2B8706m2krenCKRjB0K375hU4XMvmAZDmF8wUBRmU4qfaT4/R+uRit0mnDBmStZ2Nfhto3jXcQJxhfBSz9bLOg6KO+BE/kGYCJVtR0xcgvK2cUQfQx1QDRsTkkSaDTbzJ83l7980ZM4deUi/u8Nd/GD6+4LiWmaJGENnA2Ts0U33/LC5zyFKy89jh0P3snAQA/zh4b4xu+38aMb13vgKjOaTGOikES6CMqJyce1QmjeVTkkMUqz2eGM1Udy8iE97Nm3h0yFdqfDggHh52unvPZJGLMuD7ok6zGFOS1mIqRKgWA8Rj9BmT93gBeeu4y9Izu5Y+NYV4Lu50TiHuDj+8CiiHQL0Endnj/u8UzRIhWwK4HGo5Nl5JnwvAtP4/nnHc3Ndz/Mq6/+mcc2CmnqCAsseYAviEAtqZF12rQzwztf/3xe/5RFbF93H7Nm9ZGnA3zqJxu44Q8bA181XTMDEkgCqEwIxTN5MUO8DZFfmfeUa3k0EPRddt7RHNg3zN6xFqDUEss+Sbnmtp1hBqkgqysgiBIVmv0MMwUVvRDD8IvJ4ZRWo8ElT17NmSv6+PpPDrB7dIp66st+0YoJmRZ1VstrkSktvnGPh9YLoNcZMU2g19+HUIwxRmg2OyxcOJ+3v+hsWlMHeP9nf8SesRYgJEmZ+xlv9ozfKVirJUxNtpg1dz7/euVLePqKFpvXP8yypQvZsC/n/V+7k7Wb9gRaYwkNWSnHmEUrhLQe893l3KMVO6rOymhcPywj1Warw0nHHs4Rgxnbdoy43oFALe1w87Y223aPFRD20Geka3FLsUo2DmyMOG1KfBfGoKRJzsCsXl5/6emkTPGzu/aVZlmrxEtVUx8nQNMKdAnQBK4DR7JtRNgD3C3CuS5KcSvTjCjNZsY5q1fywiev4Je33McN92zzptJrnNqAPymmfIo64+RkizNPOZH/87cvY5msZ+/Onaw8ejk/vWsP//DVW9k/Mu6FVy5dLkhc4wUbAcNZZqPljj/VyGJoZbahgLoq0codY3ju2SsYH95Lo21ptHP6kpzarD6uvW9PROJXnQoMeNlo9NoUyzBdY4PEuInhVNzlzRtTPPNp53Ph6Yu57vd3c+sD2+lLC/hHuIZlI1tlxuw1CmKs5xC9W0T2ACYFTUA6Cteiem6wV5rTbCkvvvhkVi6s88//cQP7Jzqhwl9My4oHyxpxbLw99ZS83aCmylve8nLe86anIHvvI2soC5at4OPfvocv/uB2F6kF4UmYjDVhTNlU+NhcPhoxv4vHjvoYwBZ0I8W612gtT4EsaLXanHDMUpYPWXZum6CZufft7YH7d2ds2j4ccDQSDWuG9y5W0EbkFeLpo1PjGIlTgZ4E6inMXTibN73yAtI+5VvXbqLdzunvNXQyDTXiSmZQgQLGeVxXC8ct0cxxPLpFqqPXquoHxROUdXLh9c9eDa1J/uk/7w1IYxtRLIcJH2OopYaaEfqyKc46+Sje+p53cdG5h9Dav5760iP57e1b+OtPXMPda7dGDH0ly1GRInQ/UyARCsOWGkEwtDK2Gi9N0nJVeZlwi+GpJy1m785dTLahnXXoNTmdwUGuf3C/N4umsi+CaMygEGLicTvGX7zEODbiHgP1VJndW6Mvn+QVL72U085bwS3X38kNNz/CrF6hbTUCMU9nAQj4GC2fJ2I0LFiari00MgVydW7vThHzINgTOhn2Dc9YZfbt38M1t20PjBSW6MD94aapoZYI7akmh86t89fvuJxXvOUvGZil0N5PY3wp//CZ7/Hpq68ly9re9Jas+C4+MGG4MpSjNJrPiIIyg2CDySl9ogRhllhUIl/aanc4dsWhrJibsH3TFG01tDPLvCHYMKps2DqCb6J46s0ShVCmFBEsP9CcKIk4AfbWYE5fjcX9ltOOO44Xv+a5ZFmLr3zjRrJORtJrMB2d1j8sV6nP0JqQMM1cRJ8PAncWs4Kpz9cTl9nbr7fb+SdfdcmJdmR01Fxz23YXpFjCGHIBGnIjWtButchyeNbTz+PvP/A2TrvgYpe8ju/le9/9OR/+xFd4ZNP2MKeQWQ2+Q0Sn9dckGuJUqVSbwpx9WdrD43A01DgL32Qjf+J333LRyYczuX8/7VyYbGf0pTn1/kFuWOP6fW4zmtNUibtFUmq8icrOLlhxhfF6KszqSThsVg9nHJHwyivfzZzjVvGrq7/DHbfdz+BQwkRLZ2DRtzMw90b1FBsiUes18Ou+CpMCWerNhDUitNrZNeeeuPRDtWyy94e3btHEiFgb52HiAxSl2WyTK5xy/NFc8eYX8JpXXIxZtAyd2s2vfnknH//Ev/G72+/xMIKEjt91VKQXMcFsiDbVRwOB6rWAWfjRM+J902WxWLVK+m9LvB8Gpd3ucOTS+SwbtGzZNE5b3XqExbNTtjZqrN82Ug7nxIuykBmK5EWy7rCyaeJdRyrM7k05bWnCy/7q7Rx29rOZ2L6BH33jP0nrApkjgy8YHwt0Tsy+GLfDu1b9FNFnA7imIKMIE7ogNsvzZNZg//rTD+u74erfbHi2o1uWxBiHokrFkGcZjWYGJKw6diWXv+ypvOFFpzG4dB4Te3ZzzTW38uWv/pjfr7kbgCMXDjJ/qM6dG4dJU4NVN93rCaJcwJIUO2nL0Wa3HKQc8MxVq03TmI4qroBI6UPK7zsLctHJhzExPIIVQ7uTMZjAvKFZfOeWQvuKfNOU/U9bWbobAXX9RJOfu0iN0FtLGEwanHH+U1n29LeD6eP33/wbdm3bBmkN27EBrhLiWKtdDxSXIioDpxYkAW4A1kdcoi4PNB5wesZRs9m0e/TTjY59VpqIuF2BkOdOZ/sHZ/G0047hNc85hcvOX85Ab849jzzK97/4C77/y7tZv2lbwF2isOdAg1c++TAySbjn0b301tOAJAsWjihwKbZgW60ChZTq9lDp3mmkIQ8sUeDu5zudjGVL5nH0/DrbNzfpZBYDHL+kl7XDGY9s3h/qtG5jd8FCpVgTzTMWZs5EA6he79M0weQtTlq5lDMueyOYNjtv/j53XP8Txuilk3V8ImNKklftCrwkyhR0GlqtGKL49LS+pmox+iz5gLEya6j/d5LW1ma5Pa5Wr9vDFsw2q446lIvPWsFTTljAkYv72b57H5/75vX8ZM1m7nhgG+1OO/g4cCvFDYbJluVrv93Cx954Dh/+3gNs2LqX/t56OfderBsv9vRKFSPqqjPdeAUtn8pP1Bbrgro3oiT+MjzzzGU0xkbIVclszqLBlIUL+vncmp2gGjQ8zy2dGWgh3PBqrCxlZcgYweYtFs4b4GV/9VfMOXyArWu+z7//4wd5cEeHsWZG20pQOI0BhcX+ijBCoqiVmUpnAqwFflcEL6GInqZJIDWY1Zsmb3vminzegvmvbWn964sXDeVzB+pJKpbtu4e545Hd3L52Lw9tHiXPs4iVyPh1chrhP3xHPrecf/wi3v2SM3jHVbeyffcIA311sqKUpGVWXPivACyOkNrdexbKdlfEAFhwzYTyX87ywxbwjmccyfbNWxlr5iSJ4eTFNW7f0eGrN+1jcKifOXOGWDR3FovnDzFnqJfUc8MNj02xf2Sctes302pnJInfbiNCatwodE06HDrQwyc//Baeeu48du6Ff/qHL/LQo9sZy1PGWpa2NbRzaOZaIfortqPlWuXNrixddos/EuB1iH7DF1nyEpaWJqGh2MlzwVpZMrteG+xL72/n9ujRiY4dbeRm2vRpUuy61RI1RUlIV26pFjqdnMvOWcornnkK7/zizezYPcxAb91vU4nZigpjaIO5CTiTMLVUMtWHP6N99IpDPScCE402f//Gp3BM7QBrt4/RsdBfF45eNov67PkMzT+ERYfMJUkGGDnQZMueER7euJt1m3axcdt+du45wIHJFu12myRNfHBjMRh6Us9LOlDn4x94Hc88tc7u/ZP8r4//ggfXbYN6SqOttFXoWEev2cmdsHIt9idS4eIpR/AC0USROqwHTsKtq6sa4DRNw4GLGwFOrLW5J9r+L6+uiYk2gNmILVeIoXZa4UcrJ5uUTpbzyicfwdPPOZq//87dbN2xn/7eGnkEQY9ziaIVlEe8bGFVede+t2JApliINdVoocCLLr2IT7z+BNbd+xBbt+9DOk1MLaGhNSbawvb9DR7ZPsa6raNs2d88aANAvMYlqSt/1WsJtt1i0bw5fPTdL+Upy4YZGW/xgavv49Z7HmNgIPGrFFykmXuKzcwBCcithiXLmZYzKBV6Tc/550tnLwG+HwcvoUCRprWwnFBKrjK39EP1t6pcAOQIyUydYuMTcReVEZjmiyRGKXbEK1lmefHZS3jqacv5t19u4pFNO+nvrTniu6J+KRpxkGnUDqdcaVNhntbQr5vywzarTljFX77sabz84pVsuvNGHn74UTbummTD3hYb9zV5bPcEe0em6F4OVlyAsNZHbCgeFBFnvWaYmmxz7IrD+NBbnsMxfVsYHpvgQ//5KGse3MmcwYSsWGbpw5zcelZGC5n3+6puEHUmvlANe4JIgN+p6lNj4XUJMCmXR5UFKF9h5DRgjUffG6mCQRwOO0IpGyMOLqclIZxG9JT4oZVnnLCQS85azvfu2M3tD2ylp+5W7bilkKZrWCAsaSo77z5QMWLA5jTbGWJSLjjvTF79gnM566i5PPbIA1z7+zu4+9Ex1u9psXu04QG+XSQEEdAprn4UkWixzMRtkrE0WjlPPecUrnjRmcwevodtY20+8/NtPPDYfmb3u9ouvjCvfmlJ7gkXc28TbV6OIOBnLpXKMKwWAyOKnoNyV8l71AXGLwRYpQEWfJE7B/0c6NtEkhxsEoYyqTSRK1UPIpalwjMWJK+FEM9dOYcXnrWUNdva/OS2zdhOm97eWpWSUcoOhMZJmJ88arc79PT0cP65p/HSZ57LvHqLm25Zw7W3PszD26emLd8rlzJPL1lJlMgH1+AdUJIkNFptenvqvPR5T+E5q+bQ2n4/28bhC9dvY+v+SYZ6HN9ogH34F7Jaxgkq4lgqIpim+sZ5l2Cc6UQ/j/L2bu2raGCSJBHupLJKzX9+6RfhbhFWECjEpMpKVRxAwTgRLoMJzc9CADa3gWf7qIV9vOzcwxinh/9720627h6htychMUnpGyLfWCAPivmE449ZwUXnnIjpTHHDzXdwx7o906D34gdAu2uLMTlrwX8joSBgQgCWdTIyVU445khe+swzODTbzviOjTw8Wuc7t+5kqtWhryYBvWAiAarfmqbFBLJKRIRQVozKVQ6uqOI/4EbgVFWdcflVZELTrs5vDAjXRCTJRbgY+LWqZkZM6utIoSDpZiA0ILawkQklwn5gyfOSSDbLLbN6U15w6nyOXjqf322c4sYH99BqNtzgjBj/kFUh5tayaMEcjlyykIfWP8ZwsUPXuN5czMc5fVooXuGj3TCo0F3Js5xObpk3bzbPvOBUTlvSz9S2hxifanLr5g43rdvvZjOMhP1RBglaTnWozjE0diVDOg20pKiGnbpPU9XrZ9K+GQQYphi6aDFcoVtFclE+o+i7ALf42N/kAvhk4hpl1KOLoYRO80DVc4RawoTueStn8dzTFjPSqfOz+/bx0GPDqO3QX08Qk5BFCbwRCcCqIqXpFlrJvybdu4ArQg2kOoXtyjOyXBkaHOSc04/n3GMXonsfY8+OHezL6tz06AS7R6dI/ArZEgRdMECVoN5yfQKBpjOeuHbAh3hOUgvh/Qvw7j+2O7BLAwkLnroEKNZNxyPIzSKcDeSikhCNXpuoWiLTxqskAGyL0WbVYsjTurqnKnMH6jzv5PlceNKhPDLc4Ud/2MPazcOQd+ipJW4/kh//DguNc0t1E0q3oOJDjfEn5YCmtZmn1IL5C+Zx5uqjWbVkNmZ8F8M7tjLWsqwdVh7cNh4wL0U1xhUNkrKjEl2GQng2HnTRstYZCBB8IUiERJXbgGgF60xTNF1RaHcA0r3/tciqBTlSDHeKMNuF2X4WTUpog0o89khw3hIvY7QSJmILsvOiagNwzOIBLjt9AaccvYhHRyzX3T/MHev3MTkx6QjvPIWyiMNt2igFIUbIiKn4w0CgY9WBtLw76h8YZMXyw1i1fBHL5ibI+F5G9+xk51iHTWPC+j1TtDtZGat5IRUYoOpWNQ+u8oVqG+YSy7JZHgoVvoNZ5Ct+CbKqboowIRWhdc9K+CAmalZGReKCtMffYK/O+hci8n2EDCUpEgqXS2oUwEhJgKMRMqUYsvR8NFZtGaX5SkTx/49bMsBlZyzmnKMXMCW93LalwS2PDLN28zBj45OQV9eRp0nBouEGbQqCdlvlHsDUepg7dzaHH7KAY5cuZPm8GkNMML5/N/tHxtk21mHLmLJx71RYiCxR2F1yhle7CxJPBseHHq1GdqS2EgdUCuUaclX9weP5vYMIUKJGY9mOKVkYAoA4VdUMkcsNXAVkCmlBIqBaRUQbjKc/kAoPaPfMd6GJxT5AVwMo2XsXDtV56nFzuOCEBRx12Hyy2gBbxpR1u6bYvK/J1r2T7Bud4MBEg047J+t0EFFqtTo9vT3MGhpk7qw+Fs8bZPmiIQ6ZVWfQtOjpjDE1NsrOvcNsHWmy5QBsGcnZMdoMY9mlKy3ZeQOXAlKxy4aSXzyGPBKlDIQp4aIUSObIJuQtqvol3M7A7GDDntPywEID4zwwzomqk6fqJrPEZKBXKVwOdBBq8SROAesLFywaba7gHAn9W5+1ahBcudHS7Zgovg6b18tpy2dx2pFzWLV8HssOmcOsOXNIe3qR/lnUB4fQngFMrceVzprj5OOjTOzbR7sxyfYde9m8fT8b90yyabjN5pGcbWMd9o533H6oCJgb8tgCMSex4MqRbSpr+LqxnGV7uqTRCi2qjifc/RLwFhfAaNZNevC4QYwjJq+ORlV9Ytc4MZ5zXMhU+bIqbxIhE0i1ROV7TfTi7yZPL4evKjM+BcSgMKFlUu/KZdXd7e735g6kHD6vl8MX9HH4IbM4dNFsFixeRL2W0po8wPjoOLt27WPn/iZ7xjrsGG2zb6LDRMtRJHfnjUqJDq/MZhRRt5S12PAUUl1MYlC05E+JBmOr26qBFNGvoPJmH33mZWlXn5gA41m7mPq4UpmIv1dSLhlXq5Uvg77JQRNtLZ4UIqKo1JAkyzRqjaKG6th9g6dwAoxX8WgVPm/tEyNTOdhX2Nypj0PGKjP4P40Ty7JRWGzZlhkIX7pWznVUqQFfAd7sfZ7VJ7B7oPtHkqKLUP3gEiW5RTRnPazOlNua3Rv/WNHDBDlT0Nzt/IwgeVLuZAiuPESHZYFVw0kKYjTsFQpbVAqfIlVKxwIlF3OCOnpJj/I2EX9atE0mHh+QCnnBDP8VKUcXL8xM4Nt4emr6mkDXOFclLYQn4oTngvUnvAAkLsCbAkxf/XBBk0zFH1YW/LqbmYjIjxEOVeRMRfOAhFe6fEPXOLGWYTmUFMyqXQMrXewQxbxEFTctodttQ/JMVMqSLtoPU8ndKsl9iFI0YqcPhbauXUrTa6uq0/fHO8p7saAJol8CudxpnlshLfxRZsKZW13Fco6Zyk6xIw4aKV39Ow3wyFzhchGuKguykhTHZrXqS10a4Rkr4vJEAS2gOkxCJREu4fOFj4zS0RkI56qIdQnDoLaCAquMfMWDmzJ9UFSkK1cmYp9Cu4ZPQ18PH6x8qTCbePbdaUOcok+EbtJpYDndIzMyDcWEbuHB1cTcKyqQiHIH6MOIXKzKgCCZihpUSuBul/lxr21K/xYO1s+hm8gPd4Xv8fBJYKCXgv+l0JzEb2UxAUhsgnkwkWabLgE5LdUuAruwG74LQq4aNvZ1Cy9TNBV0GOR1wH9053kzk/vIn6CBojH+viRmhWlRaClAiZOkQiMTUc1Bjkbka6p6Hqh1yGkxiHWaWJlFLg/IKbItWX8pNr9o6A4ErdNyQjbkWhFKLYIldB329LSme824hpn4uFeo01S5BAZYKqvxCjq4QFShNwOvV61CAv8Yuc8T+X5S3UTZNcAvcTWnhO8xzdmGwEfFQRX3qbtpswTO9WqSgZoKM2H0u64dYykXDkt1F0VXxKiiFaJ0/Mx7GZRFW9sLvLDX9vJxq1GxkaoGTgfYShdqU6Ix60q7O/OCElX7LyCvFJF9IiFV+JP83eMFN8n0jdHx37U6VCmUxNyxokvBBguIWBExIuSC/krErBGRsxC70L9PHjBoUmzH1mkfspyM9QXyaH1Y0WskXg4ekc/F/GWEqpCUU0XQpfkyrcjdHROoRqlMEKYNly2CQfh9WLpO4ZXA56ObmT+eYP7UCLQiwErdmrICUXXa06dGK2lBaYKKnZGJwnpV/abAAMhpqqS+x6oiRjSK6yRa/V2CBKkg3SrXJ8rVNEbEKdEIZvxM8dKmcoSssiGU6rq7CpQxgqbGE1YiWGcs3Kge8AWQVwg86BHV06e9/4e+kmm7CiLQasyNOW0+oLJgVqNV25WBEIfywzSAXyDmOoQjgJV+93JOtOmnyqpf+DfpclBUkvoIQYBEo2BKCf2wEVo7MpiV/DfeFxX7vOkXvIwRUKy/jIl/+OtAXuNzvJY/3/zP9W9P5GckgIi6RpokLE6WaFavSi1VfTAJDr3Q3MoIuIjxIFVEeDno+1E50dMxqzHF9I3EDXOs2Mj/lmQ4cbkOlS5fZQMMsXtDShjJljiAmV7LjC+uw6Vq0VUrGMUCeQUqDyj2Y4h8t+D087z8ByW9rm6nkT9fgDEeppu4LS5cSUUju29mCfeLnX/Y+lL6IlMsLwCpg7wK9AoRWV3O/WjmW4pGVLDil4ZUOG61at66tFNiEp0oOtRiijesozUVy0OVSK5Su/RRpUVIKeGO96Hyr4j9FkobxPgLYA8mmD81Uf9jPy8HhxtIl+meQbhKtAC4amrU0pXsEq8ST1Q1d1zaJKAXqfJ2hGcYMT0eT6qu7GRFBFOOwlcXUxYLKCSehVemga4qnRYtt2SLhyvO8KzqR7iK0a7CobZQfuXQevIb3yNFdeYe3kE76Qchdv3zBBhl/cXCiZhGqlrc1QpDtusfWqrLE4qpWSpVjpCnBRcnxk0I2yJSPE5Fn4vyaoXVUM7FW9VcSoia7zP7WcJi2jPsPny8h3Ya6GD4fjDGmwkP2/SZiyQVwYrcJ/BNVX4KrFXfaVcXuNjpJXE9aL30YAyE/581cOaSmkz7+8F+Lka8x1YtSolL3hf1Byfq4EGFbyla/Mo5il7iF/6eokhfFzO4L5+qeiB0gdowRf+/MixZpmnW/5t6ky+qHkdYyftoWKv3IFwryLUga9wgIeB9tVKs4pYqlUWlgzpTVMv0WumfaWqnCbAwe0oXHWJlZVrXAKIf2A9RXRTUTMsl4w5M3DguCJBQI0jWxfq1FOQiVV0tIucquhLVhUU0WWhTXGQuUxCpBCfTk/SgKXtVdQOit4Lch+pvFNkq1dqkJ4WINitpBbc1TTgHlYNM35H0p5rX6QKMTekMgi2R29VeVxnKxwL1dSRjooEw0wVdL6aLSkF4s1ywNDoMUNecowjzROQYVZYDp6hyJOgKP7x0HDAUBplKfyag48Bal3/ajahsAr1HlccQXYfKcJcgxBWhrSJipWzFTD/gabseZh4X+5/0jwD/D7HTz7WawhElAAAAAElFTkSuQmCC';   // a logo (base64) é inserida pelo build.py
  const LS = 'robotais_v1_';
  // Temporizador que não atrasa quando a aba fica em segundo plano (usa um Worker; se não der, usa o do navegador)
  const tempo = (() => {
    let w = null, n = 0; const pend = new Map();
    const liberar = i => { const p = pend.get(i); if (p) { pend.delete(i); clearTimeout(p.t); p.r(); } };
    try {
      w = new Worker(URL.createObjectURL(new Blob(['onmessage=function(e){var i=e.data.i;setTimeout(function(){postMessage(i)},e.data.ms)}'], { type: 'text/javascript' })));
      w.onmessage = e => liberar(e.data);
      w.onerror = () => { w = null; [...pend.keys()].forEach(liberar); };
    } catch (e) { w = null; }
    return {
      worker: () => !!w,
      esperar: ms => new Promise(r => {
        if (!w) { setTimeout(r, ms); return; }
        const i = ++n, p = { r, t: setTimeout(() => liberar(i), ms + 2500) };   // reserva: se o Worker não responder, segue pelo relógio normal
        pend.set(i, p);
        try { w.postMessage({ i, ms }); } catch (e) { liberar(i); }
      })
    };
  })();
  const sleep = ms => tempo.esperar(ms);
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const soLetras = s => norm(s).replace(/[^a-z]/g, '');
  const agora = () => new Date().toLocaleTimeString('pt-BR');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(LS + k); } catch (e) { } }
  };

  /* ============ CONFIGURAÇÃO (editável no painel) ============ */
  const FRASES_PADRAO = {
    nv: ['nenhuma regra de validação', 'não foi possível validar', 'sem possibilidade de validar'],
    indef: ['não encontrei regras', 'não é possível afirmar', 'não foi possível afirmar', 'se ele atende aos critérios'],
    cadeia: ['cadeia de tickets', 'apenas de um evento'],
    nao: ['não atende', 'não normalizad', 'não está normalizad'],
    sim: ['atende aos critérios', 'está normalizad', 'sem alarme', 'nenhum alarme ativo'],
    pergunta: ['gostaria de inserir', 'deseja que eu insira', 'insira o resultado'],
    conf: ['inserid', 'anexad', 'sucesso', 'registrad', 'adicionad', 'incluíd', 'salv'],
    erro: ['não foi possível', 'erro', 'falha ao', 'não foi inserido', 'não consegui inserir']
  };
  const salvo = store.get('cfg', {});
  if (!salvo.v || salvo.v < 2) { delete salvo.limite; salvo.v = 2; }
  const CFG = Object.assign({
    tmpl: { tsk: '{codigo} validar', ne: '{codigo} testar', end: '{codigo} testar' },
    limite: 0, pausa: 2, espera: 90, estavel: 3, esperaInput: 20, simulacao: false, retomar: true, tema: 'dark',
    selInput: '', selMsgs: '', selEnviar: ''
  }, salvo);
  CFG.tmpl = Object.assign({ tsk: '{codigo} validar', ne: '{codigo} testar', end: '{codigo} testar' }, salvo.tmpl || {});
  CFG.frases = {};
  Object.keys(FRASES_PADRAO).forEach(k => { CFG.frases[k] = [...new Set([...FRASES_PADRAO[k], ...((salvo.frases && salvo.frases[k]) || [])])]; });
  const salvarCfg = () => store.set('cfg', CFG);

  /* ============ ESTADO ============ */
  let modo = store.get('modo', 'tsk');        // tsk | ne | end
  let dados = null;                            // lista unificada: {cab, linhas, orig}
  const fontes = { ag: null, na: null, lista: null };   // planilhas carregadas: Agendado, Não agendado, lista colada
  const ORIG_TXT = { ag: 'Agendado', na: 'Não agendado', lista: 'Lista colada' };
  let seguirUm = '';                           // qual planilha faltante o usuário aceitou dispensar
  let itens = [];                              // itens do teste
  let rodando = false, parar = false, faseTxt = '', itemAtual = null, inicioItem = 0;
  const NOMES_MODO = { tsk: 'Validar TSK', ne: 'Testar NE-ID', end: 'Testar END-ID' };
  const STATUS_TXT = { pendente: 'Pendente', testando: 'Testando', normalizado: 'Normalizado', nao_normalizado: 'Não normalizado', nao_validavel: 'Não validável', indefinido: 'Indefinido' };
  const STATUS_ICON = { pendente: 'relogio', testando: 'giro', normalizado: 'certo', nao_normalizado: 'erro', nao_validavel: 'menos', indefinido: 'duvida' };
  const DICA_MODO = { tsk: 'Valida a TSK na Tais e anexa o resultado no chamado.', ne: 'Testa o NE-ID na Tais. Não anexa nada.', end: 'Testa o END-ID na Tais. Não anexa nada.' };
  // regras fixas da lista
  const FILTROS = { tipo: ['Planta Interna - Manutenção Corretiva'], status: ['Não iniciado', 'Iniciado'], excluir: ['PREDITIVA', 'SUPORTE ACESSO', 'MABE'] };
  let contTsk = { ag: 0, na: 0, lista: 0 };    // TSKs válidas por origem

  /* ============ ACESSO À PÁGINA (inclui iframes do mesmo domínio) ============ */
  function docs() {
    const out = [document];
    (function walk(d) {
      d.querySelectorAll('iframe,frame').forEach(f => {
        try { const cd = f.contentDocument; if (cd && !out.includes(cd)) { out.push(cd); walk(cd); } } catch (e) { }
      });
    })(document);
    return out;
  }
  function consultar(sel) {
    if (!sel) return null;
    for (const d of docs()) { try { const el = d.querySelector(sel); if (el) return el; } catch (e) { } }
    return null;
  }
  function visivel(el) {
    try {
      if (!el.getClientRects().length) return false;
      const cs = el.ownerDocument.defaultView.getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    } catch (e) { return false; }
  }
  function cssPath(el) {
    const esc = (window.CSS && CSS.escape) ? CSS.escape : (s => s);
    const parts = []; let n = el;
    while (n && n.nodeType === 1 && n.tagName !== 'HTML') {
      if (n.id && n.ownerDocument.querySelectorAll('#' + esc(n.id)).length === 1) { parts.unshift('#' + esc(n.id)); break; }
      let p = n.tagName.toLowerCase();
      const par = n.parentElement;
      if (par) { const irm = [...par.children].filter(c => c.tagName === n.tagName); if (irm.length > 1) p += ':nth-of-type(' + (irm.indexOf(n) + 1) + ')'; }
      parts.unshift(p); n = par;
    }
    return parts.join(' > ');
  }

  function acharInput() {
    if (CFG.selInput) { const e = consultar(CFG.selInput); if (e) return e; }
    // Telegram Web K
    for (const d of docs()) {
      const tg = [...d.querySelectorAll('.input-message-input[contenteditable]')].find(e => e.isContentEditable && visivel(e));
      if (tg) return tg;
    }
    const cand = [];
    docs().forEach(d => d.querySelectorAll('textarea,input,[contenteditable],[role=textbox]').forEach(el => {
      if (el.tagName === 'INPUT' && !['text', 'search', ''].includes((el.getAttribute('type') || '').toLowerCase())) return;
      if (el.hasAttribute('contenteditable') && !el.isContentEditable) return;
      if (el.disabled || el.readOnly || !visivel(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 18) return;
      cand.push({ el, r });
    }));
    cand.sort((a, b) => (b.r.bottom - a.r.bottom) || (b.r.width - a.r.width));
    return cand.length ? cand[0].el : null;
  }
  function raizesMensagens() {
    if (CFG.selMsgs) { const e = consultar(CFG.selMsgs); if (e) return [e]; }
    const tg = docs().map(d => d.querySelector('.bubbles-inner, .bubbles')).filter(Boolean);
    if (tg.length) return tg;
    return docs().map(d => d.body).filter(Boolean);
  }
  function linhasPagina() {
    return raizesMensagens().flatMap(r => String(r.innerText || '').split('\n').map(s => s.trim()).filter(Boolean));
  }
  function novasLinhas(base, atual) {
    const cont = new Map();
    base.forEach(l => cont.set(l, (cont.get(l) || 0) + 1));
    const out = [];
    atual.forEach(l => { const c = cont.get(l) || 0; if (c > 0) cont.set(l, c - 1); else out.push(l); });
    return out;
  }
  // botões/folhas de texto visíveis cujo texto (já sem acento e minúsculo) satisfaz fn; sempre em ordem do documento
  function botoesQue(fn) {
    const alvo = new Set(), lista = [];
    docs().forEach(d => d.querySelectorAll('button,[role=button],a,input[type=button],input[type=submit],.reply-markup-button,span,div,p,li,label').forEach(el => {
      if (el.childElementCount > 3) return;
      const t = el.tagName === 'INPUT' ? el.value : el.textContent;
      if (!t || t.length > 200 || !fn(norm(t))) return;
      if (el.querySelectorAll('*').length > 6) return;
      if ([...el.children].some(c => c.textContent && fn(norm(c.textContent)))) return;   // só o elemento mais interno (não o bloco que agrupa vários botões)
      if (!visivel(el)) return;
      const alt = el.closest('button,[role=button],a,input,.reply-markup-button') || el;
      if (!alvo.has(alt)) { alvo.add(alt); lista.push(alt); }
    }));
    return lista;
  }
  const botoes = rotulo => botoesQue(t => t.replace(/[^a-z]/g, '') === rotulo);
  function clicar(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { }
    const w = el.ownerDocument.defaultView;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(t => {
      try { el.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true, view: w })); } catch (e) { }
    });
    el.click();
  }

  /* ============ ENVIO ============ */
  const valorDe = el => (el.isContentEditable ? el.innerText : el.value) || '';
  function apertarEnter(el) {
    const w = el.ownerDocument.defaultView;
    ['keydown', 'keypress', 'keyup'].forEach(t => el.dispatchEvent(new w.KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })));
  }
  function botaoEnviar(inp) {
    let n = inp;
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
      const bs = [...n.querySelectorAll('button,[role=button],.btn-send,input[type=submit]')].filter(visivel);
      const b = bs.find(x => /enviar|send/.test(norm((x.getAttribute('aria-label') || '') + ' ' + (x.title || '') + ' ' + x.textContent + ' ' + x.className)) || x.type === 'submit');
      if (b) return b;
    }
    return null;
  }
  async function enviar(inp, msg) {
    const w = inp.ownerDocument.defaultView;
    inp.focus();
    if (inp.isContentEditable) {
      inp.ownerDocument.execCommand('selectAll', false, null);
      if (!inp.ownerDocument.execCommand('insertText', false, msg)) {
        inp.textContent = msg;
        inp.dispatchEvent(new w.InputEvent('input', { bubbles: true, data: msg, inputType: 'insertText' }));
      }
    } else {
      const proto = inp.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, msg);
      inp.dispatchEvent(new w.Event('input', { bubbles: true }));
      inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    await esperar(300);
    const pick = CFG.selEnviar ? consultar(CFG.selEnviar) : null;
    if (pick) clicar(pick); else apertarEnter(inp);
    await esperar(900);
    if (valorDe(inp).trim() === msg.trim()) {
      const b = botaoEnviar(inp); if (b) clicar(b);
      await esperar(900);
    }
    if (valorDe(inp).trim() === msg.trim()) {
      const f = inp.closest('form'); if (f && f.requestSubmit) { try { f.requestSubmit(); } catch (e) { } }
      await esperar(900);
    }
    if (valorDe(inp).trim() === msg.trim()) throw new Infra('Não consegui enviar. Use “Marcar botão enviar” nos Ajustes da Tais.');
  }
  class Parado extends Error { }
  class Infra extends Error { }   // o chat da Tais não respondeu ao robô (não é resultado da TSK)
  async function esperar(ms) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { if (parar) throw new Parado(); await sleep(Math.min(200, fim - Date.now())); }
    if (parar) throw new Parado();
  }
  async function aguardarInput() {
    for (let i = 0; i < Math.max(2, Math.round(CFG.esperaInput * 2)); i++) {
      const e = acharInput();
      if (e && !e.disabled && !e.readOnly) return e;
      await esperar(500);
    }
    throw new Infra('Não achei o campo de mensagem. Abra o chat da Tais ou use “Marcar campo” nos Ajustes da Tais.');
  }

  /* ============ CLASSIFICAÇÃO ============ */
  const tem = (t, arr) => arr.some(p => p && t.includes(norm(p)));
  function classificar(texto) {
    const t = norm(texto);
    if (tem(t, CFG.frases.indef)) return 'indefinido';   // “não encontrei regras / não é possível afirmar”: nunca vira normalizado
    if (tem(t, CFG.frases.nv)) return 'nao_validavel';
    if (tem(t, CFG.frases.nao)) return 'nao_normalizado';
    if (tem(t, CFG.frases.sim)) return 'normalizado';
    return null;
  }
  function extrair(linhas) {
    const txt = linhas.join('\n');
    let ev = (txt.match(/\bEVE[\w-]*\d[\w-]*/i) || [])[0] || '';
    if (!ev) ev = (txt.match(/evento\s*[:#-]?\s*([A-Z0-9-]*\d[A-Z0-9-]*)/i) || [])[1] || '';
    const al = [];
    linhas.forEach(l => {
      const n = norm(l);
      if (/criterio|gostaria|regras de validacao|feedback|duvidas|nao foi possivel|nao e possivel/.test(n)) return;
      if (/alarm|falha|retificador|energia|bateria|sn-[a-z0-9]+/i.test(l) && !al.includes(l)) al.push(l);
    });
    return { evento: ev, alarmes: al.join(' | ').slice(0, 600) };
  }

  /* ============ TESTE DE UM ITEM ============ */
  async function testarReal(it) {
    const msg = CFG.tmpl[modo].replace('{codigo}', it.codigo);
    faseTxt = 'Procurando o campo de mensagem';
    const inp = await aguardarInput();
    const antesL = linhasPagina();
    const antesB = new Set(botoesQue(() => true));
    faseTxt = 'Enviando “' + msg + '”';
    await enviar(inp, msg);
    log('Enviado: ' + msg);
    faseTxt = 'Aguardando a Tais';
    const t0 = Date.now();
    let ultimo = '', mudou = Date.now(), cls = null;
    let cadeiaDesde = 0, cadeiaOk = false, baseResp = null, escolhido = '';
    const evn = (it.eventos || []).map(e => norm(e).replace(/\s/g, '')).filter(Boolean);
    let limite = t0 + CFG.espera * 1000, ext = 0;
    while (true) {
      if (Date.now() >= limite) {
        if (document.hidden && !ultimo && ext < 2) { ext++; limite += CFG.espera * 1000; } else break;   // aba escondida e sem nenhuma resposta: espera mais um pouco
      }
      await esperar(500);
      const nl = novasLinhas(antesL, linhasPagina());
      const txt = nl.join('\n');
      if (txt !== ultimo) { ultimo = txt; mudou = Date.now(); }
      // A Tais perguntou qual evento da cadeia validar: escolhe o evento desta TSK (vem da planilha)
      if (!cadeiaOk && tem(norm(txt), CFG.frases.cadeia)) {
        if (!cadeiaDesde) { cadeiaDesde = Date.now(); faseTxt = 'Escolhendo o evento'; }
        if (!evn.length) return { status: 'indefinido', resposta: 'Cadeia de tickets: a TSK não tem evento na planilha.\n' + txt, evento: '', alarmes: '', anexado: '' };
        const alvo = botoesQue(t => evn.some(e => t.replace(/\s/g, '').includes(e))).filter(e => !antesB.has(e));
        if (alvo.length) {
          escolhido = alvo[0].textContent.trim().replace(/\s+/g, ' ');
          baseResp = linhasPagina();
          clicar(alvo[0]); cadeiaOk = true; mudou = Date.now();
          faseTxt = 'Aguardando a validação';
          log('Evento escolhido: ' + escolhido);
        } else if (Date.now() - cadeiaDesde > 12000) {
          return { status: 'indefinido', resposta: 'Cadeia de tickets: o evento ' + (it.eventos || []).join(', ') + ' não está nas opções.\n' + txt, evento: '', alarmes: '', anexado: '' };
        }
        continue;
      }
      cls = classificar(txt);
      if (cls && Date.now() - mudou >= CFG.estavel * 1000) break;
    }
    const nl = novasLinhas(antesL, linhasPagina());
    const linhasResp = baseResp ? novasLinhas(baseResp, linhasPagina()) : nl;
    const resposta = (escolhido ? '[Cadeia: escolhido “' + escolhido + '”]\n' : '') + linhasResp.join('\n');
    const ex = extrair(linhasResp);
    if (!cls) return { status: 'indefinido', resposta: resposta || '(sem resposta no tempo limite)', evento: ex.evento, alarmes: '', anexado: '' };
    if (cls === 'indefinido') return { status: 'indefinido', resposta, evento: ex.evento, alarmes: '', anexado: '' };
    const r = { status: cls, resposta, evento: ex.evento, alarmes: ex.alarmes, anexado: '' };
    const pergunta = tem(norm(resposta), CFG.frases.pergunta);

    if (cls === 'normalizado' && modo === 'tsk') {
      faseTxt = 'Anexando no chamado';
      r.anexado = await anexar(antesB);
    } else if (cls === 'nao_normalizado' || (cls === 'normalizado' && modo !== 'tsk')) {
      if (pergunta) {                                    // limpa a pergunta de anexo sem anexar
        const n = botoes('nao').filter(e => !antesB.has(e));
        if (n.length) { clicar(n[n.length - 1]); await esperar(800); }
      }
    }
    return r;
  }
  async function anexar(antesB) {
    let sim = null;
    for (let i = 0; i < 30 && !sim; i++) {
      const novos = botoes('sim').filter(e => !antesB.has(e));
      if (novos.length) sim = novos[novos.length - 1]; else await esperar(500);
    }
    if (!sim) { log('Atenção: o botão Sim do anexo não apareceu.'); return 'FALHOU'; }
    const base = linhasPagina();
    clicar(sim);
    const t0 = Date.now(); let ult = '', mudou = Date.now();
    while (Date.now() - t0 < 25000) {
      await esperar(500);
      const txt = novasLinhas(base, linhasPagina()).join('\n');
      if (txt !== ult) { ult = txt; mudou = Date.now(); }
      const n = norm(txt);
      if (tem(n, CFG.frases.erro)) return 'FALHOU';
      if (tem(n, CFG.frases.conf) && Date.now() - mudou >= 1500) return 'SIM';
    }
    return 'VERIFICAR';
  }
  async function simular(it) {
    faseTxt = 'Simulando a resposta';
    await esperar(400 + Math.random() * 900);
    const x = Math.random();
    if (x < 0.55) return { status: 'normalizado', resposta: 'SIMULAÇÃO: atende aos critérios de fechamento', evento: '', alarmes: '', anexado: modo === 'tsk' ? (Math.random() < 0.9 ? 'SIM' : 'VERIFICAR') : '' };
    if (x < 0.85) return { status: 'nao_normalizado', resposta: 'SIMULAÇÃO: não atende. Alarme de energia ativo', evento: 'EVE' + Math.floor(Math.random() * 9e6 + 1e6), alarmes: 'SN-SIM001 falha de energia | falha de retificador', anexado: '' };
    if (x < 0.95) return { status: 'nao_validavel', resposta: 'SIMULAÇÃO: Nenhuma regra de validação foi localizada', evento: '', alarmes: '', anexado: '' };
    return { status: 'indefinido', resposta: 'SIMULAÇÃO: resposta desconhecida', evento: '', alarmes: '', anexado: '' };
  }

  /* ============ EXECUÇÃO ============ */
  async function executar() {
    if (rodando) return;
    if (!itens.length) { log('Carregue uma planilha (ou cole a lista) primeiro.'); return; }
    let pend = itens.filter(i => i.status === 'pendente');
    if (!pend.length) { log('Nenhum item pendente. Use “Limpar” para recomeçar.'); return; }
    if (CFG.limite > 0) pend = pend.slice(0, CFG.limite);
    rodando = true; parar = false; store.set('rodando', true);
    let falhasChat = 0, parouChat = false, fimExec = false, soltarLock = null;
    try { if (navigator.locks) navigator.locks.request('robotais-executando', () => new Promise(r => { if (fimExec) r(); else soltarLock = r; })); } catch (e) { }
    log('Iniciando ' + pend.length + ' item(ns): ' + NOMES_MODO[modo] + (CFG.simulacao ? ' (simulação)' : ''));
    atualizarBotoes();
    for (const it of pend) {
      if (parar) break;
      it.status = 'testando'; itemAtual = it; inicioItem = Date.now(); atualizarLinha(it); renderResumo();
      try {
        const r = CFG.simulacao ? await simular(it) : await testarReal(it);
        Object.assign(it, r, { hora: agora() });
        falhasChat = 0;
        log(it.codigo + ': ' + STATUS_TXT[it.status] + (it.anexado ? ' | anexo: ' + it.anexado : '') + (it.evento ? ' | ' + it.evento : ''));
      } catch (e) {
        if (e instanceof Parado) { it.status = 'pendente'; log('Parado.'); atualizarLinha(it); break; }
        // falha do chat: o item continua pendente; qualquer outro erro vira Indefinido. Em ambos os casos segue para o próximo.
        const chat = e instanceof Infra;
        it.status = chat ? 'pendente' : 'indefinido'; it.resposta = 'Erro: ' + e.message; it.hora = agora();
        falhasChat = chat ? falhasChat + 1 : 0;
        log('Atenção: ' + it.codigo + ': ' + e.message);
        atualizarLinha(it); salvarSessao();
        if (falhasChat >= 3) { parouChat = true; parar = true; }
      }
      itemAtual = null; atualizarLinha(it); salvarSessao(); renderResumo();
      if (!parar && it !== pend[pend.length - 1]) { try { faseTxt = 'Próximo item em instantes'; await esperar(CFG.pausa * 1000); } catch (e) { break; } }
    }
    rodando = false; itemAtual = null; faseTxt = ''; store.set('rodando', false);
    fimExec = true; if (soltarLock) soltarLock();
    const faltam = itens.filter(i => i.status === 'pendente').length;
    if (parouChat) log('Atenção: parei após 3 falhas seguidas no chat da Tais. Abra o chat e clique em Iniciar.');
    else log(faltam ? 'Fim do lote: faltam ' + faltam + ' item(ns). Clique em Iniciar para continuar.' : 'Todos os itens foram testados. Baixe o Excel.');
    atualizarBotoes(); renderResumo();
  }
  function salvarSessao() {
    store.set('sessao', { modo, quando: Date.now(), itens: itens.map(i => Object.assign({}, i, { resposta: String(i.resposta || '').slice(0, 500) })) });
  }

  /* ============ LEITURA DA PLANILHA (.xlsx sem biblioteca) ============ */
  const parseXml = t => new DOMParser().parseFromString(t, 'application/xml');
  async function lerZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Arquivo .xlsx inválido.');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const arq = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      arq[nome] = { metodo: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), lho: dv.getUint32(p + 42, true) };
      p += 46 + nl + el + cl;
    }
    return {
      async ler(nome) {
        const f = arq[nome]; if (!f) return null;
        const ini = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
        const bytes = u8.subarray(ini, ini + f.csize);
        if (f.metodo === 0) return new TextDecoder().decode(bytes);
        const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(s).text();
      }
    };
  }
  const colIdx = ref => { let n = 0; for (const ch of String(ref).replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  // junta um caminho relativo a uma pasta e resolve ./ e ../
  function juntar(dir, alvo) {
    if (alvo.startsWith('/')) return alvo.slice(1);
    const out = [];
    (dir + alvo).split('/').forEach(p => { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); });
    return out.join('/');
  }
  async function lerXlsx(buf) {
    const z = await lerZip(buf);
    // acha o workbook pelos relacionamentos do pacote (funciona com ou sem a pasta xl/)
    let wbPath = null;
    const raiz = await z.ler('_rels/.rels');
    if (raiz) {
      const r = [...parseXml(raiz).getElementsByTagName('Relationship')].find(x => /officeDocument$/.test(x.getAttribute('Type') || ''));
      if (r) wbPath = juntar('', r.getAttribute('Target'));
    }
    let wbXml = wbPath && await z.ler(wbPath);
    if (!wbXml) for (const c of ['xl/workbook.xml', 'workbook.xml']) { wbXml = await z.ler(c); if (wbXml) { wbPath = c; break; } }
    if (!wbXml) throw new Error('Arquivo .xlsx inválido.');
    const dir = wbPath.includes('/') ? wbPath.slice(0, wbPath.lastIndexOf('/') + 1) : '';
    const wb = parseXml(wbXml);
    const relXml = await z.ler(dir + '_rels/' + wbPath.slice(dir.length) + '.rels');
    const alvo = {}; let ssPath = null;
    if (relXml) [...parseXml(relXml).getElementsByTagName('Relationship')].forEach(r => {
      const t = juntar(dir, r.getAttribute('Target')); alvo[r.getAttribute('Id')] = t;
      if (/sharedStrings$/.test(r.getAttribute('Type') || '')) ssPath = t;
    });
    let comp = [];
    const ss = await z.ler(ssPath || (dir + 'sharedStrings.xml'));
    if (ss) comp = [...parseXml(ss).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].filter(t => !t.parentElement || t.parentElement.tagName !== 'rPh').map(t => t.textContent).join(''));
    const abas = [];
    for (const sh of [...wb.getElementsByTagName('sheet')]) {
      const xml = await z.ler(alvo[sh.getAttribute('r:id')]);
      if (!xml) continue;
      const linhas = [];
      [...parseXml(xml).getElementsByTagName('row')].forEach(row => {
        const arr = [];
        [...row.children].forEach(c => {
          if (c.tagName !== 'c') return;
          const t = c.getAttribute('t'); let v = '';
          if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else { const ve = c.getElementsByTagName('v')[0]; v = ve ? ve.textContent : ''; if (t === 's') v = comp[+v] != null ? comp[+v] : ''; }
          arr[colIdx(c.getAttribute('r'))] = v;
        });
        for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = '';
        linhas.push(arr);
      });
      abas.push({ nome: sh.getAttribute('name'), linhas });
    }
    return abas;
  }
  function lerTexto(txt) {
    const ls = txt.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const sep = ['\t', ';', ','].find(s => ls.some(l => l.includes(s))) || '\t';
    return [{ nome: 'Lista', linhas: ls.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())) }];
  }
  // escolhe a aba com mais linhas e acha o cabeçalho (primeira linha com 2+ células preenchidas)
  function prepararFonte(abas) {
    const a = abas.slice().sort((x, y) => y.linhas.length - x.linhas.length)[0];
    let h = 0;
    for (let k = 0; k < Math.min(10, a.linhas.length); k++) if (a.linhas[k].filter(c => String(c).trim()).length >= 2) { h = k; break; }
    if (a.linhas.every(l => l.length <= 1)) return { cab: ['Código'], linhas: a.linhas };
    const cabL = a.linhas[h], resto = a.linhas.slice(h + 1);
    const n = Math.max(cabL.length, ...resto.slice(0, 200).map(l => l.length));
    return { cab: Array.from({ length: n }, (_, j) => String(cabL[j] == null ? '' : cabL[j]).trim() || ('Coluna ' + (j + 1))), linhas: resto };
  }
  const ACHAR = {
    tsk: h => /^(numero|tsk|chamado|ticket|n)$/.test(norm(h)) || /^(numero|tsk)\b/.test(norm(h)),
    ne: h => /^ne ?-?_?id$/.test(norm(h)) || /^neid/.test(norm(h)),
    end: h => /^end ?-?_?id$/.test(norm(h)) || /^endid/.test(norm(h))
  };
  // Colunas padrão: TSK = B, ID da atividade = C, tipo da atividade = D, estado = E, regra criadora = DJ, evento = GF.
  // Procura primeiro pelo nome do cabeçalho; se não achar, usa a letra da coluna.
  function colsAuto(m) {
    const porNome = re => dados.cab.findIndex(h => re.test(norm(h)));
    const achar = (re, L) => { const i = porNome(re); if (i >= 0) return i; const j = colIdx(L); return j < dados.cab.length ? j : -1; };
    const iT = dados.cab.findIndex(ACHAR.tsk);
    const tsk = iT >= 0 ? iT : (dados.cab.length > 1 ? 1 : 0);
    const iC = m === 'tsk' ? tsk : dados.cab.findIndex(ACHAR[m]);
    return {
      cod: iC >= 0 ? iC : 0, tsk: m === 'tsk' ? -1 : tsk,
      ev: achar(/^evento$/, 'GF'), st: achar(/^(estado|status)$/, 'E'), rg: achar(/^regra( usuario)? criador/, 'DJ'),
      tp: achar(/^tipo da atividade$/, 'D'), id: achar(/^id da atividade$/, 'C')
    };
  }
  const limpo = v => { v = String(v == null ? '' : v).trim(); return (!v || /^(-|n\/?a|nan|null|none|#n\/?a)$/i.test(v)) ? '' : v; };
  // compara dois IDs de atividade: >0 se a for maior (mais recente) que b
  const cmpId = (a, b) => {
    const x = String(a == null ? '' : a).trim(), y = String(b == null ? '' : b).trim();
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) { const d = BigInt(x) - BigInt(y); return d > 0n ? 1 : (d < 0n ? -1 : 0); }
    return x.localeCompare(y, undefined, { numeric: true });
  };
  function construir() {
    itens = []; contTsk = { ag: 0, na: 0, lista: 0 };
    if (!dados) return;
    const C = colsAuto(modo);
    const cc = C.cod, ct = C.tsk, ce = C.ev, cs = C.st, cr = C.rg, cp = C.tp, ci = C.id;
    const aceitos = new Set(FILTROS.status.map(norm)), excl = FILTROS.excluir.map(norm).filter(Boolean), tipos = new Set(FILTROS.tipo.map(norm));
    const tskCol = modo === 'tsk' ? cc : ct;
    // 1) linhas válidas: tipo da atividade (D) e estado (E)
    const validas = [];
    dados.linhas.forEach((l, li) => {
      if (cp >= 0 && !tipos.has(norm(l[cp]))) return;
      if (cs >= 0 && !aceitos.has(norm(l[cs]))) return;
      validas.push(li);
    });
    // 2) TSK repetida (B): fica a de maior ID da atividade (C), a mais recente
    const porTsk = new Map(), semTsk = [];
    validas.forEach(li => {
      const t = tskCol >= 0 ? limpo(dados.linhas[li][tskCol]) : '';
      if (!t) { semTsk.push(li); return; }
      const atual = porTsk.get(t);
      if (atual == null) { porTsk.set(t, li); return; }
      if (ci >= 0 && cmpId(dados.linhas[li][ci], dados.linhas[atual][ci]) > 0) porTsk.set(t, li);
    });
    const escolhidas = [...porTsk.values(), ...semTsk].sort((a, b) => a - b);
    // 3) regra usuário criador (DJ) e montagem dos itens
    const mapa = new Map();
    escolhidas.forEach(li => {
      const l = dados.linhas[li];
      if (cr >= 0) { const r = norm(l[cr]); if (excl.some(x => r.includes(x))) return; }
      if (tskCol >= 0 && limpo(l[tskCol])) contTsk[dados.orig[li]]++;
      const c = limpo(l[cc]); if (!c) return;
      if (!mapa.has(c)) mapa.set(c, { tsks: new Set(), evs: new Set(), org: new Set(), ids: new Set() });
      const m = mapa.get(c);
      m.org.add(dados.orig[li]);
      if (modo !== 'tsk' && ct >= 0) { const t = limpo(l[ct]); if (t) m.tsks.add(t); }
      if (ci >= 0) { const v = limpo(l[ci]); if (v) m.ids.add(v); }
      if (ce >= 0) String(l[ce] == null ? '' : l[ce]).split(/[;,\s]+/).map(limpo).filter(Boolean).forEach(e => m.evs.add(e));
    });
    let n = 0;
    mapa.forEach((v, c) => {
      itens.push({ id: ++n, codigo: c, tsk: modo === 'tsk' ? c : [...v.tsks].join(', '), origem: ['ag', 'na', 'lista'].filter(k => v.org.has(k)).map(k => ORIG_TXT[k]).join(' + '), idAtividade: [...v.ids].join(', '), eventos: [...v.evs], eventoPlan: [...v.evs].join(', '), status: 'pendente', evento: '', alarmes: '', anexado: '', resposta: '', hora: '' });
    });
    atualizarSlots();
    renderTabela(); renderResumo();
  }
  // colunas que a planilha deveria ter e não tem
  function colunasFaltando() {
    const C = colsAuto('tsk');
    return [[C.tp, 'Tipo da Atividade'], [C.st, 'Estado'], [C.id, 'ID da Atividade'], [C.rg, 'Regra usuário criador'], [C.ev, 'Evento']].filter(x => x[0] < 0).map(x => x[1]);
  }

  /* ============ EXCEL DE SAÍDA (.xlsx sem biblioteca) ============ */
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipar(arqs) {
    const enc = new TextEncoder(), partes = [], central = []; let off = 0;
    arqs.forEach(a => {
      const nome = enc.encode(a.nome), dado = enc.encode(a.conteudo), crc = crc32(dado);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, dado.length, true); lh.setUint32(22, dado.length, true); lh.setUint16(26, nome.length, true);
      partes.push(new Uint8Array(lh.buffer), nome, dado);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, dado.length, true); ch.setUint32(24, dado.length, true);
      ch.setUint16(28, nome.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nome);
      off += 30 + nome.length + dado.length;
    });
    const tam = central.reduce((s, x) => s + x.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arqs.length, true); fim.setUint16(10, arqs.length, true);
    fim.setUint32(12, tam, true); fim.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xe = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const letra = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const ESTILO_STATUS = { normalizado: 2, nao_normalizado: 3, nao_validavel: 4, indefinido: 5 };
  function xmlAba(cab, linhas, estilos) {
    const larg = [14, 16, 22, 22, 16, 20, 24, 24, 50, 16, 10, 80];
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    cab.forEach((_, i) => x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (larg[i] || 18) + '" customWidth="1"/>');
    x += '</cols><sheetData>';
    const cel = (r, c, v, s) => '<c r="' + letra(c) + r + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
    x += '<row r="1">' + cab.map((v, c) => cel(1, c, v, 1)).join('') + '</row>';
    linhas.forEach((l, i) => { x += '<row r="' + (i + 2) + '">' + l.map((v, c) => cel(i + 2, c, v, estilos && estilos[i] && c === 5 ? estilos[i] : 0)).join('') + '</row>'; });
    return x + '</sheetData></worksheet>';
  }
  function gerarXlsx() {
    const cab = ['Modo', 'Origem', 'Código', 'TSK', 'ID da atividade', 'Status', 'Evento (planilha)', 'Evento (Tais)', 'Alarmes', 'Anexado no chamado', 'Hora', 'Resposta da Tais'];
    const lin = i => [NOMES_MODO[modo], i.origem || '', i.codigo, i.tsk, i.idAtividade || '', STATUS_TXT[i.status], i.eventoPlan || '', i.evento, i.alarmes, i.anexado, i.hora, i.resposta];
    const sel = st => itens.filter(i => st.includes(i.status));
    const abas = [
      ['Normalizados', sel(['normalizado'])],
      ['Não normalizados', sel(['nao_normalizado'])],
      ['Não validáveis', sel(['nao_validavel'])],
      ['Indefinidos', sel(['indefinido'])],
      ['Todos', itens]
    ];
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + abas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + abas.map((a, i) => '<sheet name="' + xe(a[0]) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>';
    const wbr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + abas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    const fill = c => '<fill><patternFill patternType="solid"><fgColor rgb="' + c + '"/><bgColor indexed="64"/></patternFill></fill>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + fill('FFC6EFCE') + fill('FFFFC7CE') + fill('FFE7E6E6') + fill('FFFFEB9C') + '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>';
    const arqs = [{ nome: '[Content_Types].xml', conteudo: ct }, { nome: '_rels/.rels', conteudo: rels }, { nome: 'xl/workbook.xml', conteudo: wb }, { nome: 'xl/_rels/workbook.xml.rels', conteudo: wbr }, { nome: 'xl/styles.xml', conteudo: styles }];
    abas.forEach((a, i) => arqs.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', conteudo: xmlAba(cab, a[1].map(lin), a[0] === 'Todos' ? a[1].map(x => ESTILO_STATUS[x.status] || 0) : null) }));
    return zipar(arqs);
  }
  function baixarExcel() {
    if (!itens.length) { log('Nada para exportar ainda.'); return; }
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const nome = 'resultado_tais_' + modo + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.xlsx';
    const url = URL.createObjectURL(gerarXlsx());
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    log('Excel gerado: ' + nome);
  }

  /* ============ PAINEL ============ */
  const svgI = d => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const IC = {
    certo: svgI('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
    erro: svgI('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    menos: svgI('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
    duvida: svgI('<circle cx="12" cy="12" r="9"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.6"/><circle cx="12" cy="16.6" r=".7" fill="currentColor" stroke="none"/>'),
    relogio: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    giro: svgI('<path d="M12 3a9 9 0 1 0 9 9"/>').replace('class="i"', 'class="i spin"'),
    ok: svgI('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x: svgI('<path d="M6 6l12 12M18 6L6 18"/>'),
    alerta: svgI('<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"/>'),
    play: svgI('<path d="M8 5.5l11 6.5-11 6.5z"/>'),
    stop: svgI('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>'),
    baixar: svgI('<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>'),
    enviar: svgI('<path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 19.5h14"/>'),
    limpar: svgI('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4"/>'),
    frasco: svgI('<path d="M9.5 3.5h5M10.5 3.5v6L5.2 18.6A1.6 1.6 0 0 0 6.6 21h10.8a1.6 1.6 0 0 0 1.4-2.4L13.5 9.5v-6"/><path d="M8 14.5h8"/>'),
    calendario: svgI('<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
    escudo: svgI('<path d="M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6z"/><path d="M8.8 12l2.4 2.4 4-4.6"/>'),
    antena: svgI('<circle cx="12" cy="12" r="1.8"/><path d="M7.6 7.6a6.2 6.2 0 0 0 0 8.8M16.4 7.6a6.2 6.2 0 0 1 0 8.8M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4"/>'),
    predio: svgI('<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20.5v-4h4v4"/>'),
    raio: svgI('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
    alvo: svgI('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/>'),
    plugue: svgI('<path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21"/>'),
    copiar: svgI('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>'),
    tema: svgI('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>'),
    largura: svgI('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
    menos2: svgI('<path d="M6 12h12"/>')
  };
  const logoImg = px => LOGO_URI ? '<img class="lg" src="' + LOGO_URI + '" width="' + px + '" height="' + px + '" alt="">' : ROBO(px, 1.6);
  const ROBO = (w, sw) => '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" fill="none" stroke="currentColor" stroke-width="' + sw + '"/><circle cx="9" cy="11" r="1.4" fill="currentColor"/><circle cx="15" cy="11" r="1.4" fill="currentColor"/><path d="M9 15h6" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round"/></svg>';
  const host = document.createElement('div');
  host.id = '__roboTais';
  host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
  document.documentElement.appendChild(host);
  ['keydown', 'keyup', 'keypress', 'paste'].forEach(t => host.addEventListener(t, e => e.stopPropagation()));
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = `
<style>
:host{all:initial}
:host,:host([data-tema="dark"]){
 --bg:rgba(8,12,22,.92);--card:rgba(255,255,255,.035);--inp:#0a1121;--line:rgba(130,170,255,.2);--grid:rgba(120,170,255,.07);
 --fg:#e7eefb;--muted:#8da0bf;--acc:#22d3ee;--acc2:#3b82f6;--glow:rgba(34,211,238,.42);--ring:rgba(34,211,238,.25);
 --ok:#34d399;--bad:#fb7185;--gray:#94a3b8;--warn:#fbbf24;
 --t-ok:rgba(52,211,153,.13);--t-bad:rgba(251,113,133,.13);--t-gray:rgba(148,163,184,.12);--t-warn:rgba(251,191,36,.13);--t-acc:rgba(34,211,238,.14);
 --hbg:linear-gradient(135deg,rgba(34,211,238,.16),rgba(59,130,246,.12));--th:#0d162b;--hov:rgba(255,255,255,.05);
 --go-fg:#031420;--solid:#0d1424;--shadow:0 28px 70px rgba(0,0,0,.65),0 0 0 1px rgba(34,211,238,.14),0 0 40px rgba(34,211,238,.08);
 --mono:ui-monospace,"Cascadia Code","SF Mono",Consolas,monospace}
:host([data-tema="light"]){
 --bg:rgba(250,252,255,.94);--card:#f2f6fc;--inp:#ffffff;--line:#d3dcec;--grid:rgba(37,99,235,.06);
 --fg:#0e1a2f;--muted:#566884;--acc:#0891b2;--acc2:#2563eb;--glow:rgba(8,145,178,.32);--ring:rgba(37,99,235,.22);
 --ok:#047857;--bad:#be123c;--gray:#516078;--warn:#a16207;
 --t-ok:rgba(16,185,129,.14);--t-bad:rgba(244,63,94,.12);--t-gray:rgba(100,116,139,.12);--t-warn:rgba(234,179,8,.17);--t-acc:rgba(8,145,178,.13);
 --hbg:linear-gradient(135deg,#e0f4fb,#e4eaff);--th:#e6edf8;--hov:rgba(15,40,90,.05);
 --go-fg:#ffffff;--solid:#ffffff;--shadow:0 22px 55px rgba(20,40,90,.28),0 0 0 1px rgba(37,99,235,.12);}
*{box-sizing:border-box;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
.p{position:relative;width:470px;max-height:92vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);font-size:13px;overflow:hidden;-webkit-backdrop-filter:blur(18px) saturate(1.3);backdrop-filter:blur(18px) saturate(1.3);animation:in .38s cubic-bezier(.2,.8,.2,1)}
.p::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:22px 22px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 60%);mask-image:linear-gradient(180deg,#000,transparent 60%)}
.p.largo{width:min(920px,96vw)}
.h,.c,.f{position:relative}
.h{display:flex;align-items:center;gap:8px;padding:11px 12px;background:var(--hbg);cursor:move;user-select:none}
.h::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,var(--acc),var(--acc2),transparent);background-size:200% 100%;opacity:.55}
.run .h::after{opacity:1;animation:slide 2.4s linear infinite}
.logo{color:var(--acc);display:grid;filter:drop-shadow(0 0 7px var(--glow))}
.tit{flex:1;display:flex;flex-direction:column;line-height:1.1}
.tit b{font-size:14px;letter-spacing:.2em;text-transform:uppercase;font-weight:800;background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.tit small{font:10px var(--mono);color:var(--muted);letter-spacing:.06em;margin-top:3px}
.led{width:9px;height:9px;border-radius:50%;background:var(--gray);flex:none}
.run .led{background:var(--acc);box-shadow:0 0 12px var(--acc);animation:pulse 1.1s ease-in-out infinite}
.ib{width:28px;height:28px;display:grid;place-items:center;padding:0;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;cursor:pointer;font-size:14px;line-height:1;transition:.16s}
.ib:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-1px);box-shadow:0 4px 14px var(--glow)}
.c{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:11px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.min .c,.min .f{display:none}
fieldset{border:1px solid var(--line);background:var(--card);border-radius:13px;padding:10px 11px 9px;margin:0;transition:border-color .2s,box-shadow .2s}
fieldset:hover{border-color:var(--acc);box-shadow:0 0 0 1px var(--ring),0 8px 24px rgba(0,0,0,.12)}
legend{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:0 6px;color:var(--acc)}
.modos{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.modos button{padding:10px 4px;border:1px solid var(--line);background:var(--inp);color:var(--fg);border-radius:11px;cursor:pointer;font-weight:600;font-size:12px;transition:.16s}
.modos button:hover:not(:disabled){border-color:var(--acc);transform:translateY(-2px);box-shadow:0 6px 18px var(--glow)}
.modos button.on{border-color:var(--acc);background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(59,130,246,.2));box-shadow:0 0 0 1px var(--acc) inset,0 0 20px var(--glow)}
.modos button:disabled{opacity:.5;cursor:not-allowed}
label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--muted)}
input[type=text],input[type=number],select,textarea{border:1px solid var(--line);border-radius:9px;padding:6px 8px;font-size:12px;width:100%;background:var(--inp);color:var(--fg);transition:.15s;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--ring)}
input[type=checkbox]{accent-color:var(--acc);width:15px;height:15px}
input[type=file]{font-size:12px;color:var(--muted)}
input[type=file]::file-selector-button{margin-right:9px;border:1px solid var(--line);background:var(--inp);color:var(--fg);border-radius:8px;padding:6px 11px;cursor:pointer;font-weight:600;transition:.15s}
input[type=file]::file-selector-button:hover{border-color:var(--acc);color:var(--acc)}
textarea{min-height:60px;font-family:var(--mono)}
.l{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.l>*{flex:1;min-width:90px}
.b{padding:8px 11px;border:1px solid var(--line);background:var(--inp);border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;color:var(--fg);transition:.16s}
.b:hover:not(:disabled){border-color:var(--acc);color:var(--acc);transform:translateY(-1px);box-shadow:0 5px 16px var(--glow)}
.b:active:not(:disabled){transform:translateY(0)}
.b:disabled{opacity:.4;cursor:not-allowed}
.go{background:linear-gradient(135deg,var(--acc),var(--acc2));border:0;color:var(--go-fg);font-size:14px;flex:2;box-shadow:0 7px 20px var(--glow)}
.go:hover:not(:disabled){color:var(--go-fg);filter:brightness(1.1);box-shadow:0 10px 28px var(--glow)}
.stop{background:linear-gradient(135deg,#fb7185,#e11d48);border:0;color:#fff}
.stop:hover:not(:disabled){color:#fff;box-shadow:0 6px 20px rgba(244,63,94,.45)}
.agora{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:13px;padding:10px 12px;background:var(--card);min-height:56px;color:var(--muted)}
.agora b{font-size:15px;color:var(--fg);font-family:var(--mono)}
.agora.on{border-color:var(--acc);background:var(--t-acc);box-shadow:0 0 0 1px var(--ring),0 0 26px var(--glow)}
.agora.on::after{content:"";position:absolute;top:0;left:-45%;width:45%;height:100%;pointer-events:none;background:linear-gradient(100deg,transparent,var(--ring),transparent);animation:sweep 1.9s linear infinite}
.pr{display:flex;align-items:center;gap:9px}
.prog{flex:1;height:7px;border-radius:99px;background:var(--inp);border:1px solid var(--line);overflow:hidden}
.prog i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 12px var(--glow);transition:width .45s}
.pr span{font:11px var(--mono);color:var(--muted);min-width:56px;text-align:right}
.cont{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:7px}
.cont div{position:relative;overflow:hidden;text-align:center;border-radius:11px;padding:8px 2px 6px;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--line);background:var(--card);color:var(--muted);transition:.16s}
.cont div::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:var(--c);box-shadow:0 0 10px var(--c)}
.cont div:hover{transform:translateY(-2px);border-color:var(--c);box-shadow:0 6px 18px rgba(0,0,0,.14)}
.cont strong{display:block;font:700 21px var(--mono);letter-spacing:0;color:var(--c);text-shadow:0 0 14px var(--c);margin-bottom:1px}
.k-p{--c:var(--acc)}.k-n,.k-a{--c:var(--ok)}.k-r{--c:var(--bad)}.k-g{--c:var(--gray)}.k-y{--c:var(--warn)}
.prontos{background:var(--t-ok);border:1px solid var(--ok);border-radius:13px;padding:10px 11px;box-shadow:0 0 26px var(--t-ok)}
.prontos h4{margin:0 0 7px;color:var(--ok);font-size:12px;letter-spacing:.05em;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.chips{display:flex;flex-wrap:wrap;gap:5px;max-height:92px;overflow:auto}
.chips span{background:var(--inp);border:1px solid var(--ok);color:var(--fg);border-radius:99px;padding:2px 10px;font:11px var(--mono);cursor:pointer;transition:.15s}
.chips span:hover{background:var(--ok);color:var(--inp);transform:translateY(-1px);box-shadow:0 4px 12px var(--t-ok)}
.tab{max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:13px;background:var(--card);scrollbar-width:thin;scrollbar-color:var(--line) transparent}
table{border-collapse:collapse;width:100%;font-size:12px}
th{position:sticky;top:0;z-index:1;background:var(--th);color:var(--muted);text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
td{padding:5px 8px;border-top:1px solid var(--line);vertical-align:top;word-break:break-word}
td:nth-child(1),td:nth-child(2){white-space:nowrap;font-family:var(--mono)}
td:nth-child(5),th:nth-child(5){white-space:nowrap;font-size:11px}
tr{cursor:pointer;transition:background .15s}tr:hover td{background:var(--hov)}
tr.normalizado{background:var(--t-ok)}tr.nao_normalizado{background:var(--t-bad)}tr.nao_validavel{background:var(--t-gray)}tr.indefinido{background:var(--t-warn)}
tr.normalizado td:first-child{box-shadow:inset 3px 0 0 var(--ok)}tr.nao_normalizado td:first-child{box-shadow:inset 3px 0 0 var(--bad)}tr.nao_validavel td:first-child{box-shadow:inset 3px 0 0 var(--gray)}tr.indefinido td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
tr.testando{font-weight:600;animation:rowglow 1.2s ease-in-out infinite}tr.testando td:first-child{box-shadow:inset 3px 0 0 var(--acc)}
.det{display:none;white-space:pre-wrap;font:11px/1.4 var(--mono);color:var(--muted);margin-top:4px;background:var(--inp);border:1px solid var(--line);padding:6px;border-radius:8px}tr.open .det{display:block}
.alm{font-size:11px;color:var(--bad)}
.sub{font:10px var(--mono);color:var(--muted);white-space:normal}
.i{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.spin{animation:giro 1s linear infinite}
.ib .i{width:15px;height:15px}
.modos button{display:flex;align-items:center;justify-content:center;gap:6px}
.b{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.b.mini{padding:2px 8px;font-size:11px}
.dica{font-size:11.5px;color:var(--muted);margin-top:8px}
label.chk{flex-direction:row;gap:7px;align-items:center;color:var(--fg);font-size:12px;margin-top:6px}
.upt{display:flex;align-items:center;gap:6px}.upt .i{color:var(--acc)}
.upb{display:flex;align-items:center;justify-content:center;gap:6px;grid-column:2;grid-row:1 / span 2;padding:8px 14px}
.upt,.uph{grid-column:1}
.upi{grid-column:1 / -1;margin-top:4px;padding-top:7px;border-top:1px dashed var(--line)}
.unm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.upi .ico{display:inline-flex;flex:none}.upi>span{display:flex;gap:6px;min-width:0;width:100%;align-items:center;flex-wrap:wrap}.upi .tt{display:flex;gap:6px;align-items:baseline;min-width:0;flex:1}
.upi b{font-weight:700;white-space:nowrap;flex:none;color:var(--fg)}.uav{font-size:10.5px;margin-top:2px}
.sti{display:inline-flex;margin-right:5px;vertical-align:-.2em}
tr.normalizado .sti{color:var(--ok)}tr.nao_normalizado .sti{color:var(--bad)}tr.nao_validavel .sti{color:var(--gray)}tr.indefinido .sti{color:var(--warn)}tr.testando .sti{color:var(--acc)}tr.pendente .sti{color:var(--muted)}
.an{display:inline-flex;align-items:center;gap:4px;font-weight:600}.an-ok{color:var(--ok)}.an-erro{color:var(--bad)}.an-ver{color:var(--warn)}
.agora b{display:flex;align-items:center;gap:7px}.agora b .i{color:var(--acc)}
.bt{display:flex;align-items:center;gap:7px}
.prontos h4 .i{width:16px;height:16px}
.f span{display:inline-flex;align-items:center;gap:6px}.f .i{color:var(--acc)}
.lanc .i{width:28px;height:28px}
.logo .lg{display:block;border-radius:50%;box-shadow:0 0 0 1px rgba(212,175,55,.65),0 0 14px rgba(212,175,55,.38)}
.bt .lg{border-radius:50%;box-shadow:0 0 0 1px rgba(212,175,55,.6)}
.lanc-logo{background:#000;padding:0;overflow:hidden;box-shadow:0 0 0 2px rgba(212,175,55,.75),0 8px 26px rgba(212,175,55,.38);animation:pulsog 2.4s ease-in-out infinite}
.lanc-logo .lg{width:100%;height:100%;display:block;border-radius:50%}
.lanc-logo:hover{transform:scale(1.08)}
.ups{display:grid;grid-template-columns:1fr;gap:8px}
.up{border:1px dashed var(--line);border-radius:12px;padding:10px;background:var(--inp);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;align-items:center;transition:.2s;min-width:0}
.up:hover,.up.drag{border-color:var(--acc);box-shadow:0 0 0 3px var(--ring)}
.up.ok{border:1px solid var(--ok);background:var(--t-ok)}.up.aviso{border:1px solid var(--warn);background:var(--t-warn)}
.up.pisca{animation:pisca .9s ease 2}
.upt{font-weight:700;font-size:13px}
.uph{font-size:10.5px;color:var(--muted);line-height:1.4}.uph i{font:10px var(--mono);font-style:normal;word-break:break-all;color:var(--fg);opacity:.8}
.upb{display:block;text-align:center;border:1px solid var(--line);border-radius:9px;padding:6px;cursor:pointer;font-weight:600;font-size:12px;background:var(--card);color:var(--fg);transition:.15s}
.upb:hover{border-color:var(--acc);color:var(--acc);box-shadow:0 5px 16px var(--glow)}.upb input{display:none}
.upi{display:flex;align-items:flex-start;gap:6px;font-size:11px;color:var(--muted);word-break:break-word}
.up.ok .upi{color:var(--ok)}.up.aviso .upi{color:var(--warn)}
.upi .x{margin-left:auto;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:13px;padding:0 2px}.upi .x:hover{color:var(--bad)}
.modal{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:16px;background:rgba(2,6,16,.55);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);animation:in .2s}
.balao{position:relative;max-width:370px;background:var(--solid);color:var(--fg);border:1px solid var(--acc);border-radius:18px;padding:16px 16px 14px;box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 30px var(--glow)}
.balao::after{content:"";position:absolute;left:34px;bottom:-9px;width:16px;height:16px;background:var(--solid);border-right:1px solid var(--acc);border-bottom:1px solid var(--acc);transform:rotate(45deg)}
.bt{font-weight:800;color:var(--acc);letter-spacing:.03em;margin-bottom:6px}.bx{font-size:13px;line-height:1.5;color:var(--fg)}
.bb{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.bb .go{flex:none;font-size:12px}
.nota{font-size:11px;color:var(--muted)}
.toast{position:absolute;left:12px;right:12px;bottom:46px;z-index:5;display:flex;gap:8px;align-items:flex-start;padding:9px 12px;border-radius:12px;background:var(--solid);color:var(--fg);border:1px solid var(--acc);box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 22px var(--glow);font-size:12px;line-height:1.4;cursor:pointer;animation:in .2s}
.toast[hidden]{display:none}.toast .tic{display:inline-flex;margin-top:1px;color:var(--ok)}
.toast.warn{border-color:var(--warn)}.toast.warn .tic{color:var(--warn)}
.min .toast{display:none}
details>summary{cursor:pointer;font-weight:700;color:var(--acc);font-size:12px;transition:.15s}details>summary:hover{filter:brightness(1.2)}
.f{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 14px;border-top:1px solid var(--line);background:var(--card);font-size:11px;color:var(--muted)}
.f b{color:var(--acc);letter-spacing:.05em;text-shadow:0 0 12px var(--glow)}.f span:last-child{font-family:var(--mono)}
.lanc{display:none;place-items:center;width:52px;height:52px;border:0;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--acc2));color:var(--go-fg);cursor:pointer;box-shadow:0 8px 26px var(--glow);transition:.18s;animation:pulseb 2.4s ease-in-out infinite}
.lanc:hover{transform:scale(1.08) rotate(-4deg)}
@keyframes pisca{50%{box-shadow:0 0 0 4px var(--glow);border-color:var(--acc)}}
@keyframes giro{to{transform:rotate(360deg)}}
@keyframes in{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes pulse{50%{opacity:.35;transform:scale(.8)}}
@keyframes pulsog{50%{box-shadow:0 0 0 2px rgba(212,175,55,.95),0 8px 40px rgba(212,175,55,.65)}}
@keyframes pulseb{50%{box-shadow:0 8px 40px var(--glow),0 0 0 8px var(--ring)}}
@keyframes slide{to{background-position:-200% 0}}
@keyframes sweep{to{left:110%}}
@keyframes rowglow{50%{background:var(--t-acc)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
<button class="lanc${LOGO_URI ? ' lanc-logo' : ''}" id="lanc" title="Abrir Robô Tais">${LOGO_URI ? logoImg(52) : ROBO(28, 1.7)}</button>
<div class="p" id="p">
 <div class="h" id="h"><span class="logo">${LOGO_URI ? logoImg(36) : ROBO(26, 1.6)}</span><div class="tit"><b>Robô Tais</b><small>VALIDAÇÃO AUTOMÁTICA · v${VERSAO}</small></div><span class="led" id="led" title="Estado do robô"></span><button class="ib" id="bTema" title="Tema claro ou escuro">${IC.tema}</button><button class="ib" id="bLargo" title="Aumentar ou diminuir o painel">${IC.largura}</button><button class="ib" id="bMin" title="Minimizar">${IC.menos2}</button><button class="ib" id="bX" title="Esconder o painel (o robô continua)">${IC.x}</button></div>
 <div class="c">
  <fieldset><legend>1. O que fazer</legend>
   <div class="modos"><button data-m="tsk">${IC.escudo}Validar TSK</button><button data-m="ne">${IC.antena}Testar NE-ID</button><button data-m="end">${IC.predio}Testar END-ID</button></div>
   <div class="dica" id="dicaModo"></div>
  </fieldset>
  <fieldset><legend>2. Planilha</legend>
   <div class="ups">
    <div class="up" id="upAg">
     <div class="upt">${IC.calendario}Agendado</div>
     <div class="uph">Nome com a data de hoje<br><i>ex.: Atividades-TRJ_FMMT_17_11_26</i></div>
     <label class="upb">${IC.enviar}Escolher arquivo<input type="file" id="arqAg" accept=".xlsx,.csv,.txt"></label>
     <div class="upi"><span id="infoAg">Nenhum arquivo.</span><button class="x" id="rmAg" title="Remover arquivo" hidden>${IC.x}</button></div>
    </div>
    <div class="up" id="upNa">
     <div class="upt">${IC.relogio}Não agendado</div>
     <div class="uph">Nome com “não agendada”<br><i>ex.: Atividades-TRJ_FMMT_Não-agendada</i></div>
     <label class="upb">${IC.enviar}Escolher arquivo<input type="file" id="arqNa" accept=".xlsx,.csv,.txt"></label>
     <div class="upi"><span id="infoNa">Nenhum arquivo.</span><button class="x" id="rmNa" title="Remover arquivo" hidden>${IC.x}</button></div>
    </div>
   </div>
   <details style="margin-top:8px"><summary>ou cole a lista aqui</summary><textarea id="cola" placeholder="Uma TSK, NE-ID ou END-ID por linha"></textarea><button class="b" id="bCola" style="margin-top:4px">Usar lista</button></details>
   <button class="b" id="bRec" style="display:none;margin-top:6px"></button>
  </fieldset>
  <fieldset><legend>3. Executar</legend>
   <div class="l"><label title="Texto enviado à Tais. {codigo} vira a TSK, o NE-ID ou o END-ID.">Mensagem enviada<input type="text" id="tmpl"></label><label title="Quantos itens testar agora. 0 testa todos.">Quantidade (0 = todos)<input type="number" id="lim" min="0"></label></div>
   <div class="l" style="margin-top:6px"><label title="Espera entre um item e outro.">Pausa entre itens (s)<input type="number" id="pausa" min="0"></label><label title="Tempo máximo para a Tais responder.">Tempo limite por item (s)<input type="number" id="espera" min="10"></label></div>
   <label class="chk" title="Roda com respostas de teste, sem usar a Tais."><input type="checkbox" id="sim">${IC.frasco}Simulação</label>
   <label class="chk" title="Continua o teste se a página recarregar."><input type="checkbox" id="ret">Retomar se a página recarregar</label>
   <div class="l" style="margin-top:8px"><button class="b go" id="bGo">${IC.play}Iniciar</button><button class="b stop" id="bStop" disabled>${IC.stop}Parar</button><button class="b" id="bXls">${IC.baixar}Excel</button><button class="b" id="bLimpa">${IC.limpar}Limpar</button></div>
  </fieldset>
  <div class="agora" id="agora">Parado.</div>
  <div class="pr"><div class="prog"><i id="progI"></i></div><span id="progT">0 / 0</span></div>
  <div class="cont" id="cont"></div>
  <div class="prontos" id="prontos"><h4>${IC.certo}Prontos para encerrar: <span id="nPront">0</span> <button class="b mini" id="bCopia" title="Copia a lista de TSKs prontas">${IC.copiar}Copiar</button></h4><div class="chips" id="chips"></div></div>
  <div><div class="l" style="margin-bottom:4px"><label>Mostrar<select id="filtro"><option value="">Todos</option><option value="normalizado">Normalizados</option><option value="nao_normalizado">Não normalizados</option><option value="nao_validavel">Não validáveis</option><option value="indefinido">Indefinidos</option><option value="pendente">Pendentes</option></select></label></div>
   <div class="tab"><table><thead><tr><th>#</th><th>Código</th><th id="thTsk">TSK</th><th>Status</th><th>Anexo</th></tr></thead><tbody id="tb"></tbody></table></div></div>
  <details><summary>Ajustes da Tais</summary>
   <div class="nota" style="margin-top:6px">Use se o robô não achar o chat ou não entender uma resposta.</div>
   <div class="l" style="margin:6px 0"><button class="b" id="bConn" title="Confere se o robô encontra o chat">${IC.plugue}Testar conexão</button><button class="b" id="pInp" title="Clique no campo onde se digita">${IC.alvo}Marcar campo de mensagem</button><button class="b" id="pMsg" title="Clique na área da conversa">${IC.alvo}Marcar área das mensagens</button><button class="b" id="pEnv" title="Clique no botão de enviar">${IC.alvo}Marcar botão enviar</button><button class="b" id="pZera" title="Volta à detecção automática">Automático</button></div>
   <div class="nota" id="calib"></div>
   <div class="nota" style="margin-top:8px">Frases da Tais, uma por linha.</div>
   <label>Normalizado<textarea id="fSim"></textarea></label>
   <label>Não normalizado<textarea id="fNao"></textarea></label>
   <label>Não validável<textarea id="fNv"></textarea></label>
   <label>Indefinido<textarea id="fInd"></textarea></label>
   <label>Pergunta da cadeia de tickets<textarea id="fCad"></textarea></label>
   <label>Pergunta para anexar o resultado<textarea id="fPer"></textarea></label>
   <label>Confirmação de anexo<textarea id="fConf"></textarea></label>
   <div class="l" style="margin-top:6px"><button class="b" id="bFr">Salvar frases</button><button class="b" id="bFrPad">Restaurar padrão</button></div>
  </details>
 </div>
 <div class="f"><span>${IC.raio}Desenvolvido por <b>Lucas e Marcio</b></span><span>v${VERSAO}</span></div>
 <div class="toast" id="toast" hidden></div>
</div>`;
  function aplicarTema() { host.setAttribute('data-tema', CFG.tema === 'light' ? 'light' : 'dark'); }
  aplicarTema();
  const $ = s => sr.querySelector(s);
  const $$ = s => [...sr.querySelectorAll(s)];

  // Avisos curtos na tela: só o que o usuário precisa ver (erros, confirmações e fim do lote)
  const MOSTRAR = /^(Atenção|Campo|Clique|Marcado|Cancelado|Copiado|Excel gerado|Frases|Resultados|Fim do lote|Todos os itens|Parando|Sessão|Nada|Carregue|Nenhum)/;
  let toastT = null;
  function log(m) {
    if (!MOSTRAR.test(m)) return;
    const t = $('#toast'); if (!t) return;
    const aviso = /^Atenção|não encontrado/.test(m);
    t.className = 'toast' + (aviso ? ' warn' : ''); t.textContent = '';
    const ic = document.createElement('span'); ic.className = 'tic'; ic.innerHTML = aviso ? IC.alerta : IC.certo;
    const tx = document.createElement('span'); tx.textContent = m.replace(/^Atenção: /, '');
    t.append(ic, tx); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 6500);
  }
  const linhasTr = new Map();
  function renderTabela() {
    const tb = $('#tb'); tb.textContent = ''; linhasTr.clear();
    $('#thTsk').style.display = modo === 'tsk' ? 'none' : '';
    itens.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td>';
      tr.addEventListener('click', () => tr.classList.toggle('open'));
      tb.appendChild(tr); linhasTr.set(it.id, tr); atualizarLinha(it);
    });
    aplicarFiltro();
  }
  function atualizarLinha(it) {
    const tr = linhasTr.get(it.id); if (!tr) return;
    tr.className = (it.status) + (tr.classList.contains('open') ? ' open' : '');
    const td = tr.children;
    td[0].textContent = it.id; td[1].textContent = it.codigo;
    const sub = [it.origem === ORIG_TXT.lista ? '' : it.origem, it.idAtividade ? 'ID ' + it.idAtividade : '', it.eventoPlan].filter(Boolean).join(' · ');
    if (sub) { const sb = document.createElement('div'); sb.className = 'sub'; sb.textContent = sub; td[1].appendChild(sb); }
    td[2].textContent = it.tsk; td[2].style.display = modo === 'tsk' ? 'none' : '';
    td[3].textContent = ''; const st = document.createElement('div'); const si = document.createElement('span'); si.className = 'sti'; si.innerHTML = IC[STATUS_ICON[it.status]]; st.append(si, STATUS_TXT[it.status]); td[3].appendChild(st);
    if (it.evento || it.alarmes) { const a = document.createElement('div'); a.className = 'alm'; a.textContent = [it.evento, it.alarmes].filter(Boolean).join(' • '); td[3].appendChild(a); }
    const d = document.createElement('div'); d.className = 'det'; d.textContent = it.resposta || ''; td[3].appendChild(d);
    const AN = { SIM: ['an-ok', IC.ok, 'SIM'], FALHOU: ['an-erro', IC.x, 'FALHOU'], VERIFICAR: ['an-ver', IC.alerta, 'VERIFICAR'] }[it.anexado];
    if (AN) td[4].innerHTML = '<span class="an ' + AN[0] + '">' + AN[1] + AN[2] + '</span>'; else td[4].textContent = (it.status === 'normalizado' && modo === 'tsk') ? '' : '—';
    if (it.status === 'testando') tr.scrollIntoView({ block: 'nearest' });
  }
  function aplicarFiltro() {
    const f = $('#filtro').value;
    itens.forEach(it => { const tr = linhasTr.get(it.id); if (tr) tr.style.display = (!f || it.status === f) ? '' : 'none'; });
  }
  function prontos() {
    return itens.filter(i => i.status === 'normalizado' && (modo !== 'tsk' || i.anexado === 'SIM'));
  }
  function renderResumo() {
    const c = s => itens.filter(i => i.status === s).length;
    const anex = itens.filter(i => i.anexado === 'SIM').length;
    const caixas = [['k-p', c('pendente') + c('testando'), 'Faltam'], ['k-n', c('normalizado'), 'Normaliz.'], ['k-r', c('nao_normalizado'), 'Não norm.'], ['k-g', c('nao_validavel'), 'Não valid.'], ['k-y', c('indefinido'), 'Indef.']];
    if (modo === 'tsk') caixas.push(['k-a', anex, 'Anexados']);
    $('#cont').innerHTML = caixas.map(x => '<div class="' + x[0] + '"><strong>' + x[1] + '</strong>' + x[2] + '</div>').join('');
    const pr = prontos();
    const feitos = itens.filter(i => i.status !== 'pendente' && i.status !== 'testando').length;
    $('#progI').style.width = (itens.length ? feitos / itens.length * 100 : 0) + '%'; $('#progT').textContent = feitos + ' / ' + itens.length;
    $('#nPront').textContent = pr.length;
    const ch = $('#chips'); ch.textContent = '';
    pr.forEach(i => { const s = document.createElement('span'); s.textContent = modo === 'tsk' ? i.codigo : (i.codigo + (i.tsk ? ' (' + i.tsk + ')' : '')); s.title = 'Clique para copiar'; s.onclick = () => copiar(modo === 'tsk' ? i.codigo : (i.tsk || i.codigo)); ch.appendChild(s); });
    aplicarFiltro();
  }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); log('Copiado: ' + t.split('\n').length + ' item(ns)'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); log('Copiado.'); }
  }
  function atualizarBotoes() {
    $('#bGo').disabled = rodando; $('#bStop').disabled = !rodando; $('#bLimpa').disabled = rodando;
    $$('.modos button').forEach(b => { b.classList.toggle('on', b.dataset.m === modo); b.disabled = rodando; });
    $('#dicaModo').textContent = DICA_MODO[modo];
  }
  setInterval(() => {
    const a = $('#agora'); $('#p').classList.toggle('run', rodando);
    if (rodando && itemAtual) { a.className = 'agora on'; a.innerHTML = ''; const b = document.createElement('b'); b.innerHTML = IC.giro; b.append('Testando agora: ' + itemAtual.codigo); const d = document.createElement('div'); d.textContent = faseTxt + ' · ' + Math.round((Date.now() - inicioItem) / 1000) + 's · item ' + itemAtual.id + ' de ' + itens.length; a.append(b, d); }
    else if (rodando) { a.className = 'agora on'; a.textContent = faseTxt || 'Preparando'; }
    else { a.className = 'agora'; a.textContent = 'Parado.'; }
  }, 500);

  function preencherCfg() {
    $('#tmpl').value = CFG.tmpl[modo]; $('#lim').value = CFG.limite; $('#pausa').value = CFG.pausa; $('#espera').value = CFG.espera;
    $('#sim').checked = CFG.simulacao; $('#ret').checked = CFG.retomar;
    $('#fSim').value = CFG.frases.sim.join('\n'); $('#fNao').value = CFG.frases.nao.join('\n'); $('#fNv').value = CFG.frases.nv.join('\n');
    $('#fPer').value = CFG.frases.pergunta.join('\n'); $('#fConf').value = CFG.frases.conf.join('\n');
    $('#fInd').value = CFG.frases.indef.join('\n'); $('#fCad').value = CFG.frases.cadeia.join('\n');
    $('#calib').textContent = 'Campo: ' + (CFG.selInput ? 'marcado' : 'automático') + ' · Mensagens: ' + (CFG.selMsgs ? 'marcadas' : 'automático') + ' · Envio: ' + (CFG.selEnviar ? 'botão marcado' : 'tecla Enter');
  }
  function lerCfg() {
    CFG.tmpl[modo] = $('#tmpl').value || '{codigo}'; CFG.limite = Math.max(0, +$('#lim').value || 0);
    CFG.pausa = Math.max(0, +$('#pausa').value || 0); CFG.espera = Math.max(10, +$('#espera').value || 90);
    CFG.simulacao = $('#sim').checked; CFG.retomar = $('#ret').checked; salvarCfg();
  }
  ['#tmpl', '#lim', '#pausa', '#espera', '#sim', '#ret'].forEach(s => $(s).addEventListener('change', lerCfg));
  $('#filtro').addEventListener('change', aplicarFiltro);

  function trocarModo(m) {
    modo = m; store.set('modo', m); preencherCfg(); atualizarBotoes();
    $('#dicaModo').textContent = DICA_MODO[m];
    if (dados) construir(); else { renderTabela(); renderResumo(); }
  }
  $$('.modos button').forEach(b => b.addEventListener('click', () => trocarModo(b.dataset.m)));

  // junta as planilhas carregadas (Agendado + Não agendado) numa só lista
  function montarDados() {
    const usar = fontes.lista ? [['lista', fontes.lista]] : [['ag', fontes.ag], ['na', fontes.na]].filter(x => x[1]);
    if (!usar.length) { dados = null; itens = []; contTsk = { ag: 0, na: 0, lista: 0 }; atualizarSlots(); renderTabela(); renderResumo(); return; }
    const base = usar[0][1];
    dados = { cab: base.cab, linhas: [], orig: [] };
    usar.forEach(([k, f]) => {
      if (f.cab.join('|') !== base.cab.join('|')) log('Atenção: “' + f.nome + '” tem colunas diferentes do primeiro arquivo.');
      f.linhas.forEach(l => { dados.linhas.push(l); dados.orig.push(k); });
    });
    construir();
    if (!fontes.lista) { const falta = colunasFaltando(); if (falta.length) log('Atenção: a planilha não tem a coluna ' + falta.join(', ') + '.'); }
  }
  const hojeTxt = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '_' + p(d.getMonth() + 1) + '_' + String(d.getFullYear()).slice(2); };
  const ehNaoAgendada = nome => /\bn(ao|\s?o)\s+agendad/.test(norm(nome).replace(/[_\-.]+/g, ' '));
  function checarNome(slot, nome) {
    if (slot === 'ag') {
      if (ehNaoAgendada(nome)) return { ok: false, msg: 'Parece o arquivo não agendado.' };
      const m = nome.match(/(\d{1,2})[_\-.](\d{1,2})[_\-.](\d{2,4})/);
      if (!m) return { ok: false, msg: 'Sem a data no nome (hoje: ' + hojeTxt() + ').' };
      const d = new Date(), ano = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      if (+m[1] !== d.getDate() || +m[2] !== d.getMonth() + 1 || ano !== d.getFullYear()) return { ok: false, msg: 'Data do nome: ' + m[1] + '/' + m[2] + '/' + m[3] + '. Hoje: ' + hojeTxt().replace(/_/g, '/') + '.' };
      return { ok: true };
    }
    return ehNaoAgendada(nome) ? { ok: true } : { ok: false, msg: 'Sem “não agendada” no nome.' };
  }
  const SLOT = { ag: { el: '#upAg', info: '#infoAg', rm: '#rmAg', inp: '#arqAg', nome: 'Agendado' }, na: { el: '#upNa', info: '#infoNa', rm: '#rmNa', inp: '#arqNa', nome: 'Não agendado' } };
  function atualizarSlots() {
    ['ag', 'na'].forEach(k => {
      const S = SLOT[k], f = fontes[k], box = $(S.el), el = $(S.info);
      box.classList.toggle('ok', !!f && f.chk.ok); box.classList.toggle('aviso', !!f && !f.chk.ok);
      $(S.rm).hidden = !f;
      el.textContent = '';
      if (!f) { el.textContent = 'Nenhum arquivo.'; return; }
      const ico = document.createElement('span'); ico.className = 'ico'; ico.innerHTML = f.chk.ok ? IC.ok : IC.alerta;
      const t = document.createElement('span'); t.className = 'tt';
      const nm = document.createElement('span'); nm.className = 'unm'; nm.textContent = f.nome; nm.title = f.nome;
      const q = contTsk[k] || 0;
      const b = document.createElement('b'); b.textContent = q + (q === 1 ? ' TSK válida' : ' TSKs válidas');
      t.append(nm, b);
      el.append(ico, t);
      if (!f.chk.ok) { const m = document.createElement('div'); m.className = 'uav'; m.textContent = f.chk.msg; el.appendChild(m); }
    });
  }
  async function carregarArquivo(slot, f) {
    try {
      const abas = /\.xlsx$/i.test(f.name) ? await lerXlsx(await f.arrayBuffer()) : lerTexto(await f.text());
      if (!abas.length) throw new Error('Planilha vazia.');
      const fonte = prepararFonte(abas); fonte.nome = f.name; fonte.chk = checarNome(slot, f.name);
      fontes[slot] = fonte; fontes.lista = null; seguirUm = '';
      log('Planilha ' + SLOT[slot].nome + ': ' + f.name + ' (' + fonte.linhas.length + ' linhas)');
      montarDados();
    } catch (err) { log('Atenção: não consegui ler “' + f.name + '”. ' + err.message); }
  }
  ['ag', 'na'].forEach(k => {
    const S = SLOT[k];
    $(S.inp).addEventListener('change', e => { const f = e.target.files[0]; if (f) carregarArquivo(k, f); e.target.value = ''; });
    $(S.rm).addEventListener('click', () => { if (rodando) return; fontes[k] = null; seguirUm = ''; montarDados(); log('Planilha ' + S.nome + ' removida.'); });
    const box = $(S.el);
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) carregarArquivo(k, f); });
  });
  $('#bCola').addEventListener('click', () => {
    const t = $('#cola').value; if (!t.trim()) return;
    const fonte = prepararFonte(lerTexto(t)); fonte.nome = 'lista colada';
    fontes.lista = fonte; fontes.ag = fontes.na = null; seguirUm = '';
    log('Lista colada: ' + fonte.linhas.length + ' linhas.'); montarDados();
  });

  // balão de escolha dentro do painel
  function perguntar({ titulo, texto, botoes }) {
    if ($('.modal')) return;
    const ov = document.createElement('div'); ov.className = 'modal';
    const card = document.createElement('div'); card.className = 'balao';
    const t = document.createElement('div'); t.className = 'bt'; t.innerHTML = LOGO_URI ? logoImg(22) : ROBO(18, 1.8); t.append(titulo);
    const x = document.createElement('div'); x.className = 'bx'; x.textContent = texto;
    const bb = document.createElement('div'); bb.className = 'bb';
    botoes.concat([{ rotulo: 'Cancelar', cancelar: true }]).forEach(b => {
      const el = document.createElement('button'); el.className = 'b' + (b.primario ? ' go' : '');
      el.textContent = b.rotulo; el.onclick = () => { ov.remove(); if (b.fn) b.fn(); };
      bb.appendChild(el);
    });
    card.append(t, x, bb); ov.appendChild(card); $('#p').appendChild(ov);
  }
  function iniciar() {
    const falta = fontes.lista ? '' : (fontes.ag && !fontes.na ? 'na' : (!fontes.ag && fontes.na ? 'ag' : ''));
    if (falta && seguirUm !== falta) {
      const tem = SLOT[falta === 'na' ? 'ag' : 'na'].nome, sem = SLOT[falta].nome;
      perguntar({
        titulo: 'Só uma planilha',
        texto: 'Só a planilha “' + tem + '” foi anexada. Seguir só com ela?',
        botoes: [
          { rotulo: 'Seguir só com ' + tem, primario: true, fn: () => { seguirUm = falta; executar(); } },
          { rotulo: 'Anexar ' + sem, fn: () => { const b = $(SLOT[falta].el); b.classList.add('pisca'); setTimeout(() => b.classList.remove('pisca'), 2200); $(SLOT[falta].inp).click(); } }
        ]
      });
      return;
    }
    executar();
  }
  $('#bGo').addEventListener('click', () => { lerCfg(); iniciar(); });
  $('#bStop').addEventListener('click', () => { parar = true; store.set('rodando', false); log('Parando após o item atual.'); });
  $('#bXls').addEventListener('click', baixarExcel);
  $('#bLimpa').addEventListener('click', () => { if (itens.length && !confirm('Limpar os resultados?')) return; itens.forEach(i => Object.assign(i, { status: 'pendente', evento: '', alarmes: '', anexado: '', resposta: '', hora: '' })); store.del('sessao'); renderTabela(); renderResumo(); log('Resultados limpos.'); });
  $('#bCopia').addEventListener('click', () => copiar(prontos().map(i => modo === 'tsk' ? i.codigo : (i.tsk || i.codigo)).join('\n')));
  $('#bX').addEventListener('click', () => { $('#p').style.display = 'none'; $('#lanc').style.display = 'block'; });
  $('#lanc').addEventListener('click', () => { $('#p').style.display = ''; $('#lanc').style.display = 'none'; });
  $('#toast').addEventListener('click', () => { $('#toast').hidden = true; });
  $('#bTema').addEventListener('click', () => { CFG.tema = CFG.tema === 'light' ? 'dark' : 'light'; salvarCfg(); aplicarTema(); });
  $('#bMin').addEventListener('click', () => $('#p').classList.toggle('min'));
  $('#bLargo').addEventListener('click', () => $('#p').classList.toggle('largo'));

  $('#bFr').addEventListener('click', () => {
    const l = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    CFG.frases = { sim: l('#fSim'), nao: l('#fNao'), nv: l('#fNv'), indef: l('#fInd'), cadeia: l('#fCad'), pergunta: l('#fPer'), conf: l('#fConf'), erro: CFG.frases.erro }; salvarCfg(); log('Frases salvas.');
  });
  $('#bFrPad').addEventListener('click', () => { CFG.frases = JSON.parse(JSON.stringify(FRASES_PADRAO)); salvarCfg(); preencherCfg(); log('Frases restauradas.'); });
  $('#bConn').addEventListener('click', () => {
    const i = acharInput();
    log(i ? 'Campo de mensagem encontrado.' : 'Campo de mensagem não encontrado. Abra o chat da Tais ou use “Marcar campo de mensagem”.');
    if (i) { const o = i.style.outline; i.style.outline = '3px solid #16a34a'; setTimeout(() => { i.style.outline = o; }, 2500); }
  });
  function marcar(chave, nome) {
    log('Clique em: ' + nome + ' (ESC cancela).');
    host.style.display = 'none'; let ant = null, antO = '';
    const ds = docs();
    const sobre = e => { if (ant) ant.style.outline = antO; ant = e.target; antO = ant.style.outline; ant.style.outline = '3px solid #f59e0b'; };
    const fim = () => { ds.forEach(d => { d.removeEventListener('mouseover', sobre, true); d.removeEventListener('click', clique, true); d.removeEventListener('keydown', tecla, true); }); if (ant) ant.style.outline = antO; host.style.display = ''; };
    const clique = e => { e.preventDefault(); e.stopPropagation(); const alvo = e.target; fim(); CFG[chave] = cssPath(alvo); salvarCfg(); preencherCfg(); log('Marcado.'); };
    const tecla = e => { if (e.key === 'Escape') { fim(); log('Cancelado.'); } };
    ds.forEach(d => { d.addEventListener('mouseover', sobre, true); d.addEventListener('click', clique, true); d.addEventListener('keydown', tecla, true); });
  }
  $('#pInp').addEventListener('click', () => marcar('selInput', 'o CAMPO onde se digita a mensagem'));
  $('#pMsg').addEventListener('click', () => marcar('selMsgs', 'a ÁREA onde aparecem as mensagens da conversa'));
  $('#pEnv').addEventListener('click', () => marcar('selEnviar', 'o BOTÃO de enviar'));
  $('#pZera').addEventListener('click', () => { CFG.selInput = CFG.selMsgs = CFG.selEnviar = ''; salvarCfg(); preencherCfg(); log('Calibração automática restaurada.'); });

  // arrastar o painel
  (() => {
    let dx = 0, dy = 0, arr = false;
    $('#h').addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') return; arr = true; const r = host.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (!arr) return; host.style.left = Math.max(0, e.clientX - dx) + 'px'; host.style.top = Math.max(0, e.clientY - dy) + 'px'; host.style.right = 'auto'; });
    window.addEventListener('mouseup', () => { arr = false; });
  })();

  /* ============ RETOMAR SESSÃO (página recarregada) ============ */
  function restaurar(auto) {
    const s = store.get('sessao', null);
    if (!s || !s.itens || !s.itens.length) return false;
    modo = s.modo; store.set('modo', modo); preencherCfg(); atualizarBotoes();
    itens = s.itens.map(i => Object.assign({}, i, { status: i.status === 'testando' ? 'pendente' : i.status }));
    renderTabela(); renderResumo();
    log('Sessão anterior restaurada (' + itens.filter(i => i.status !== 'pendente').length + ' testados, ' + itens.filter(i => i.status === 'pendente').length + ' pendentes).');
    return true;
  }
  const sessaoAnt = store.get('sessao', null);
  if (sessaoAnt && sessaoAnt.itens && sessaoAnt.itens.length) {
    const b = $('#bRec'); b.style.display = '';
    b.innerHTML = IC.limpar; b.append('Retomar último teste (' + sessaoAnt.itens.length + ' itens)');
    b.addEventListener('click', () => restaurar());
  }
  window.__roboTais = {
    mostrar() { host.style.display = ''; $('#p').style.display = ''; $('#lanc').style.display = 'none'; },
    _debug: { get itens() { return itens; }, CFG, classificar, extrair, gerarXlsx, lerXlsx, sleep, get timerWorker() { return tempo.worker(); } }
  };
  host.dataset.timer = tempo.worker() ? 'worker' : 'padrao';
  preencherCfg(); atualizarBotoes(); renderResumo();
  log('Robô Tais pronto.');
  if (store.get('rodando', false) && CFG.retomar && restaurar(true)) {
    log('A página recarregou durante um teste. Retomando em 6 segundos… (clique em Parar para cancelar)');
    setTimeout(() => { if (!parar && store.get('rodando', false)) { executar(); } }, 6000);
  }
})();
